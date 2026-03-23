import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import type { ImageBlock, YmmpData, YmmpItem } from "./types.ts";
import {
  buildClippingShapeItem,
  buildImageItem,
  buildVideoItem,
  buildTextItem,
  getItems,
  hasRemark,
} from "./ymmp.ts";
import {
  makeRemark,
  REMARK_PREFIX,
  toWindowsUncPath,
} from "./util.ts";
import { generateImages, type GenerateResult } from "./imagen.ts";
import {
  AI_IMAGE_WIDTH,
  AI_IMAGE_HEIGHT,
  DEFAULT_IMAGE_ZOOM,
  DESC_MAX_LENGTH,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  REJECTED_EXTENSIONS,
} from "./constants.ts";

/**
 * Check file extension and return item type to use.
 * Returns "image", "video", "rejected", or "unknown".
 */
function classifyExtension(filePath: string): "image" | "video" | "rejected" | "unknown" {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (REJECTED_EXTENSIONS.has(ext)) return "rejected";
  return "unknown";
}

/**
 * Build an ImageItem or VideoItem depending on file type.
 * Video types (webp, mp4, etc.) get looped playback and clipping.
 */
function buildItemForFile(
  template: YmmpItem | undefined,
  filePath: string,
  params: { frame: number; length: number; zoom: number; imageId: string },
  extKind: "image" | "video" | "rejected" | "unknown" = "image",
): YmmpItem {
  if (extKind === "video") {
    return buildVideoItem(template, { filePath, ...params });
  }
  return buildImageItem(template, { filePath, ...params });
}

/**
 * Step 4: Insert clipping ShapeItems on Layer 10 for each image block
 */
export function step4_insertClipping(
  data: YmmpData,
  blocks: ImageBlock[],
): number {
  const items = getItems(data);

  let inserted = 0;
  for (const block of blocks) {
    const remark = `${REMARK_PREFIX}:clipping:${block.group.imageId}`;
    if (hasRemark(items, remark)) {
      continue; // already inserted
    }
    const newItem = buildClippingShapeItem(block.frame, block.length);
    newItem.Remark = remark;
    items.push(newItem);
    inserted++;
  }

  return inserted;
}

/**
 * Step 5: Insert photo/diagram images + reference text
 */
export async function step5_insertPhotos(
  data: YmmpData,
  blocks: ImageBlock[],
  photosDir: string,
  resizedDir: string,
): Promise<{ inserted: number; skipped: string[] }> {
  const items = getItems(data);
  let inserted = 0;
  const skipped: string[] = [];

  // List photo files
  const photoFiles = await fs.readdir(photosDir).catch(() => [] as string[]);

  for (const block of blocks) {
    if (block.group.imageType !== "実写" && block.group.imageType !== "図解") {
      continue;
    }

    const remark = makeRemark(block.group.imageId);
    if (hasRemark(items, remark)) {
      continue;
    }

    // Find matching photo file
    const photoFile = photoFiles.find((f) => {
      const name = path.basename(f);
      const ext = path.extname(f);
      return name === block.group.imageId + ext;
    });
    if (!photoFile) {
      console.warn(`  警告: ${block.group.imageId} の画像ファイルが見つかりません`);
      skipped.push(block.group.imageId);
      continue;
    }

    // Check extension
    const extKind = classifyExtension(photoFile);
    if (extKind === "rejected") {
      console.warn(`  警告: ${block.group.imageId} の拡張子 ${path.extname(photoFile)} はYMM4非対応のためスキップします`);
      skipped.push(block.group.imageId);
      continue;
    }
    if (extKind === "unknown") {
      console.warn(`  警告: ${block.group.imageId} の拡張子 ${path.extname(photoFile)} はYMM4での対応が不明です。そのまま挿入します`);
    }

    const photoPath = path.resolve(photosDir, photoFile);

    // Resize image to fit clipping area (skip videos)
    let insertPath = photoPath;
    let resizedWidth = 0;
    if (extKind === "image") {
      try {
        await fs.mkdir(resizedDir, { recursive: true });
        const ext = path.extname(photoFile);
        const resizedPath = path.join(resizedDir, `${block.group.imageId}${ext}`);
        const result = await sharp(photoPath)
          .resize(AI_IMAGE_WIDTH, AI_IMAGE_HEIGHT, { fit: "inside" })
          .toFile(resizedPath);
        insertPath = resizedPath;
        resizedWidth = result.width;
      } catch {
        console.warn(`  警告: ${block.group.imageId} のリサイズ失敗。元画像で挿入します。`);
      }
    }

    const zoom = DEFAULT_IMAGE_ZOOM;
    const uncPath = toWindowsUncPath(insertPath);
    const item = buildItemForFile(undefined, uncPath, {
      frame: block.frame,
      length: block.length,
      zoom,
      imageId: block.group.imageId,
    }, extKind);
    items.push(item);
    inserted++;

    // Insert reference text if URL exists
    if (block.group.referenceUrl) {
      const textItem = buildTextItem({
        text: block.group.referenceUrl,
        frame: block.frame,
        length: block.length,
        imageId: block.group.imageId,
        imageWidth: resizedWidth || AI_IMAGE_WIDTH,
        zoom,
      });
      items.push(textItem);
    }
  }

  return { inserted, skipped };
}

/**
 * Step 6: Generate AI images
 */
export async function step6_generateAi(
  blocks: ImageBlock[],
  apiKey: string,
  outputDir: string,
  style: string,
  negative: string,
  maxGenerate?: number,
): Promise<GenerateResult[]> {
  const aiBlocks = blocks.filter((b) => b.group.imageType === "AI");
  if (aiBlocks.length === 0) {
    console.log("AI画像生成対象なし");
    return [];
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const tasks = aiBlocks.map((block) => {
    // Sanitize description for filename
    const safeDesc = block.group.description
      .replace(/[/\\:*?"<>|]/g, "_")
      .slice(0, DESC_MAX_LENGTH);
    // Prepend style prefix and append negative suffix
    let prompt = block.group.aiPrompt;
    if (style) prompt = `${style}, ${prompt}`;
    if (negative) prompt = `${prompt}. ${negative}`;
    return {
      imageId: block.group.imageId,
      prompt,
      outputPath: path.join(outputDir, `${block.group.imageId}_${safeDesc}.jpg`),
      description: block.group.description,
    };
  });

  console.log(`\nAI画像生成: ${tasks.length}枚 (model: gemini-flash${style ? `, style: "${style}"` : ""})`);
  return generateImages(tasks, apiKey, maxGenerate);
}

/**
 * Step 7: Insert generated AI images into ymmp
 */
export async function step7_insertAi(
  data: YmmpData,
  blocks: ImageBlock[],
  outputDir: string,
): Promise<{ inserted: number; skipped: string[] }> {
  const items = getItems(data);
  let inserted = 0;
  const skipped: string[] = [];

  const aiBlocks = blocks.filter((b) => b.group.imageType === "AI");
  const outputFiles = await fs.readdir(outputDir).catch(() => [] as string[]);

  for (const block of aiBlocks) {
    const remark = makeRemark(block.group.imageId);
    if (hasRemark(items, remark)) {
      continue;
    }

    // Find generated image file
    const imageFile = outputFiles.find((f) => {
      const base = path.basename(f, path.extname(f)).split("_")[0];
      return base === block.group.imageId;
    });
    if (!imageFile) {
      skipped.push(block.group.imageId);
      continue;
    }

    const imagePath = path.resolve(outputDir, imageFile);

    const zoom = DEFAULT_IMAGE_ZOOM;

    const uncPath = toWindowsUncPath(imagePath);
    const item = buildItemForFile(undefined, uncPath, {
      frame: block.frame,
      length: block.length,
      zoom,
      imageId: block.group.imageId,
    });
    items.push(item);
    inserted++;
  }

  return { inserted, skipped };
}
