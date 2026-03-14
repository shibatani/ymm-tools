import pLimit from "p-limit";
import sharp from "sharp";
import { API_CONCURRENCY, AI_IMAGE_WIDTH, AI_IMAGE_HEIGHT, RETRYABLE_STATUS_CODES } from "./constants.ts";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
  error?: { message: string };
}

const GEMINI_MODEL = "gemini-3.1-flash-image-preview";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = [5000, 10000, 20000, 40000, 60000];

/**
 * Global backoff gate: when a 429 hits, ALL concurrent tasks pause
 * until the backoff expires, preventing a stampede of retries.
 */
class GlobalBackoff {
  private _resumeAt = 0;

  /** Signal that a rate-limit was hit; all tasks should wait at least `ms` */
  trigger(ms: number): void {
    const target = Date.now() + ms;
    if (target > this._resumeAt) {
      this._resumeAt = target;
    }
  }

  /** Wait until the global backoff window has passed (no-op if not active) */
  async wait(): Promise<void> {
    const remaining = this._resumeAt - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}

/**
 * Retry wrapper with exponential backoff + jitter.
 * Accepts a shared GlobalBackoff so that a 429 from any task pauses all tasks.
 */
async function withRetry<T>(
  fn: () => Promise<Response>,
  extractResult: (response: Response) => Promise<T>,
  gate?: GlobalBackoff,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Wait for any global backoff before sending the request
    if (gate) await gate.wait();

    const response = await fn();

    if (response.ok) {
      return extractResult(response);
    }

    // Non-retryable client errors: fail immediately
    if (!RETRYABLE_STATUS_CODES.has(response.status)) {
      const body = await response.text();
      throw new Error(
        `API クライアントエラー (リトライ不可): ${response.status} ${body.slice(0, 300)}`,
      );
    }

    if (attempt < MAX_RETRIES) {
      const base = BACKOFF_BASE_MS[attempt] ?? 60000;
      const jitter = Math.random() * base * 0.5;
      const backoff = base + jitter;

      // On 429, apply backoff globally so other concurrent tasks also pause
      if (response.status === 429 && gate) {
        gate.trigger(backoff);
        console.warn(
          `  ⚠ Gemini rate-limited (429), global pause ${(backoff / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
      } else {
        console.warn(
          `  ⚠ Gemini API error (${response.status}), retrying in ${(backoff / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, backoff));
    } else {
      const body = await response.text();
      throw new Error(
        `API ${MAX_RETRIES}回リトライ後も失敗: ${response.status} ${body.slice(0, 300)}`,
      );
    }
  }

  throw new Error("unreachable");
}

/**
 * Generate a single image via Gemini Flash
 */
function generateSingle(
  prompt: string,
  apiKey: string,
  gate?: GlobalBackoff,
): Promise<string> {
  const url = `${BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  return withRetry(
    () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "16:9",
            },
          },
        }),
      }),
    async (response) => {
      const data = (await response.json()) as GeminiResponse;
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) {
        throw new Error(
          `APIからレスポンスが返されませんでした: ${JSON.stringify(data).slice(0, 300)}`,
        );
      }
      const imagePart = parts.find((p) => p.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        throw new Error(
          `APIから画像データが返されませんでした: ${parts.map((p) => p.text ?? "[image]").join(" ")}`,
        );
      }
      return imagePart.inlineData.data;
    },
    gate,
  );
}

export interface GenerateResult {
  imageId: string;
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Generate AI images with concurrency control
 */
export async function generateImages(
  tasks: Array<{
    imageId: string;
    prompt: string;
    outputPath: string;
    description: string;
  }>,
  apiKey: string,
  maxGenerate?: number,
): Promise<GenerateResult[]> {
  const limit = pLimit(API_CONCURRENCY);
  const gate = new GlobalBackoff();

  // Slice upfront to avoid race condition on concurrent counter
  const effectiveTasks =
    maxGenerate !== undefined ? tasks.slice(0, maxGenerate) : tasks;
  const skippedTasks =
    maxGenerate !== undefined ? tasks.slice(maxGenerate) : [];

  const results: GenerateResult[] = [];

  // Report skipped tasks due to --max-generate limit
  for (const task of skippedTasks) {
    results.push({
      imageId: task.imageId,
      success: false,
      error: `--max-generate ${maxGenerate} 制限`,
    });
  }

  const promises = effectiveTasks.map((task) =>
    limit(async () => {
      // Idempotency: skip if file exists
      if (await Bun.file(task.outputPath).exists()) {
        console.log(`  スキップ: ${task.imageId} は生成済み`);
        results.push({
          imageId: task.imageId,
          success: true,
          filePath: task.outputPath,
        });
        return;
      }

      // Wait for any global backoff before starting
      await gate.wait();

      try {
        console.log(`  生成中: ${task.imageId} - ${task.description}`);
        const base64 = await generateSingle(task.prompt, apiKey, gate);
        const rawBuffer = Buffer.from(base64, "base64");
        // Resize to target dimensions
        const buffer = await sharp(rawBuffer)
          .resize(AI_IMAGE_WIDTH, AI_IMAGE_HEIGHT, { fit: "fill" })
          .jpeg({ quality: 85 })
          .toBuffer();
        await Bun.write(task.outputPath, buffer);
        console.log(`  ✅ ${task.imageId} 完了`);
        results.push({
          imageId: task.imageId,
          success: true,
          filePath: task.outputPath,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ ${task.imageId} 失敗: ${message}`);
        results.push({
          imageId: task.imageId,
          success: false,
          error: message,
        });
      }
    }),
  );

  await Promise.all(promises);
  return results;
}

// Export for testing
export { generateSingle as _generateSingleForTest };
