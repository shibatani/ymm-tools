import path from "node:path";
import fs from "node:fs/promises";
import { imageSize } from "image-size";
import type { Chapter, ImageBlock, YmmpData, YmmpItem } from "./types.ts";
import {
  buildImageItem,
  buildShapeItem,
  buildTextItem,
  findShapeTemplate,
  getItems,
  hasRemark,
} from "./ymmp.ts";
import {
  calcZoom,
  CLIP_HEIGHT,
  CLIP_WIDTH,
  makeRemark,
  REMARK_PREFIX,
  toWindowsUncPath,
} from "./util.ts";
import { generateImages, type GenerateResult } from "./imagen.ts";

/**
 * Step 4: Insert clipping ShapeItems on Layer 10 for each chapter
 */
export function step4_insertClipping(
  data: YmmpData,
  chapters: Chapter[],
): number {
  const items = getItems(data);
  const template = findShapeTemplate(items);
  if (!template) {
    console.warn("警告: ShapeItemテンプレート (Layer 6) が見つかりません。Step 4 をスキップします。");
    return 0;
  }

  let inserted = 0;
  for (const chapter of chapters) {
    const remark = `${REMARK_PREFIX}:clipping:${chapter.frame}`;
    if (hasRemark(items, remark)) {
      continue; // already inserted
    }
    const newItem = buildShapeItem(template, chapter.frame, chapter.length);
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
): Promise<{ inserted: number; skipped: string[] }> {
  const items = getItems(data);
  const template = findShapeTemplate(items);
  if (!template) {
    console.warn("警告: ShapeItemテンプレート (Layer 6) が見つかりません。デフォルト座標で挿入します。");
  }
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
    const photoFile = photoFiles.find((f) =>
      path.basename(f).startsWith(block.group.imageId),
    );
    if (!photoFile) {
      console.warn(`  警告: ${block.group.imageId} の画像ファイルが見つかりません`);
      skipped.push(block.group.imageId);
      continue;
    }

    const photoPath = path.resolve(photosDir, photoFile);

    // Get image dimensions for zoom calculation
    let zoom = 100;
    try {
      const dimensions = imageSize(photoPath);
      if (dimensions.width && dimensions.height) {
        zoom = calcZoom(dimensions.width, dimensions.height, CLIP_WIDTH, CLIP_HEIGHT);
      }
    } catch {
      console.warn(`  警告: ${block.group.imageId} の画像サイズ取得失敗。Zoom=100で挿入します。`);
    }

    const uncPath = toWindowsUncPath(photoPath);
    const imageItem = buildImageItem(template, {
      filePath: uncPath,
      frame: block.frame,
      length: block.length,
      zoom,
      imageId: block.group.imageId,
    });
    items.push(imageItem);
    inserted++;

    // Insert reference text if URL exists
    if (block.group.referenceUrl) {
      const textItem = buildTextItem({
        text: block.group.referenceUrl,
        frame: block.frame,
        length: block.length,
        imageId: block.group.imageId,
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
      .slice(0, 50);
    return {
      imageId: block.group.imageId,
      prompt: block.group.aiPrompt,
      outputPath: path.join(outputDir, `${block.group.imageId}_${safeDesc}.jpg`),
      description: block.group.description,
    };
  });

  console.log(`\nAI画像生成: ${tasks.length}枚`);
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
  const template = findShapeTemplate(items);
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
    const imageFile = outputFiles.find((f) =>
      f.startsWith(block.group.imageId),
    );
    if (!imageFile) {
      skipped.push(block.group.imageId);
      continue;
    }

    const imagePath = path.resolve(outputDir, imageFile);

    // Get image dimensions
    let zoom = 100;
    try {
      const dimensions = imageSize(imagePath);
      if (dimensions.width && dimensions.height) {
        zoom = calcZoom(dimensions.width, dimensions.height, CLIP_WIDTH, CLIP_HEIGHT);
      }
    } catch {
      console.warn(`  警告: ${block.group.imageId} の画像サイズ取得失敗。Zoom=100で挿入します。`);
    }

    const uncPath = toWindowsUncPath(imagePath);
    const imageItem = buildImageItem(template, {
      filePath: uncPath,
      frame: block.frame,
      length: block.length,
      zoom,
      imageId: block.group.imageId,
    });
    items.push(imageItem);
    inserted++;
  }

  return { inserted, skipped };
}
