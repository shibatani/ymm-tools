import pLimit from "p-limit";

interface ImagenResponse {
  predictions?: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
  error?: { message: string };
}

const MODEL = "imagen-4.0-ultra-generate-001";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;
const BACKOFF_MS = [2000, 4000, 8000];

/**
 * Generate a single image via Imagen 4 Ultra API
 */
async function generateSingle(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const url = `${BASE_URL}/${MODEL}:predictLongRunning`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          sampleImageSize: "1K",
          enhancePrompt: true,
          language: "ja",
          personGeneration: "allow_adult",
          outputOptions: {
            mimeType: "image/jpeg",
            compressionQuality: 75,
          },
        },
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as ImagenResponse;
      const prediction = data.predictions?.[0];
      if (!prediction?.bytesBase64Encoded) {
        throw new Error(
          `APIから画像データが返されませんでした: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }
      return prediction.bytesBase64Encoded;
    }

    if (attempt < MAX_RETRIES) {
      const backoff = BACKOFF_MS[attempt] ?? 8000;
      console.warn(
        `  ⚠ API error (${response.status}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    } else {
      const body = await response.text();
      throw new Error(
        `API ${MAX_RETRIES}回リトライ後も失敗: ${response.status} ${body.slice(0, 200)}`,
      );
    }
  }

  throw new Error("unreachable");
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
  const limit = pLimit(5);

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

      try {
        console.log(`  生成中: ${task.imageId} - ${task.description}`);
        const base64 = await generateSingle(task.prompt, apiKey);
        const buffer = Buffer.from(base64, "base64");
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
