import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import type { CliOptions, ImageGroup } from "./types.ts";
import { CLIP_WIDTH, CLIP_HEIGHT } from "./util.ts";
import { readImageSheet } from "./csv-reader.ts";
import {
  readYmmp,
  writeYmmp,
  getItems,
  findVoiceItems,
  detectChapters,
} from "./ymmp.ts";
import { matchEntries } from "./matcher.ts";
import {
  step4_insertClipping,
  step5_insertPhotos,
  step6_generateAi,
  step7_insertAi,
} from "./steps.ts";

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      csv: { type: "string" },
      ymmp: { type: "string" },
      photos: { type: "string" },
      output: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "max-generate": { type: "string" },
      "clip-width": { type: "string" },
      "clip-height": { type: "string" },
    },
    strict: true,
  });

  if (!values.csv || !values.ymmp || !values.photos || !values.output) {
    console.error(
      "使用法: bun run src/index.ts --csv <path> --ymmp <path> --photos <dir> --output <path> [--dry-run] [--max-generate N] [--clip-width N] [--clip-height N]",
    );
    process.exit(1);
  }

  return {
    csv: path.resolve(values.csv),
    ymmp: path.resolve(values.ymmp),
    photos: path.resolve(values.photos),
    output: path.resolve(values.output),
    dryRun: values["dry-run"] ?? false,
    maxGenerate: values["max-generate"]
      ? parseInt(values["max-generate"], 10)
      : undefined,
    clipWidth: values["clip-width"]
      ? parseInt(values["clip-width"], 10)
      : CLIP_WIDTH,
    clipHeight: values["clip-height"]
      ? parseInt(values["clip-height"], 10)
      : CLIP_HEIGHT,
  };
}

async function validateInputs(opts: CliOptions): Promise<void> {
  // Check file existence
  if (!(await Bun.file(opts.csv).exists())) {
    throw new Error(`CSVファイルが見つかりません: ${opts.csv}`);
  }
  if (!(await Bun.file(opts.ymmp).exists())) {
    throw new Error(`ymmpファイルが見つかりません: ${opts.ymmp}`);
  }

  // Check photos directory existence
  try {
    const stat = await fs.stat(opts.photos);
    if (!stat.isDirectory()) {
      throw new Error(`photosパスはディレクトリではありません: ${opts.photos}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`photosディレクトリが見つかりません: ${opts.photos}`);
    }
    throw err;
  }

  // Check output != input
  if (opts.output === opts.ymmp) {
    throw new Error("出力先パスは入力ymmpと異なるパスを指定してください");
  }
}

/**
 * Validate image groups for conflicts and missing files
 */
async function validateImageGroups(
  groups: ImageGroup[],
  photosDir: string,
): Promise<void> {
  // Check for image ID type conflicts
  const typeMap = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const entry of group.entries) {
      const types = typeMap.get(entry.imageId) ?? new Set();
      types.add(entry.imageType);
      typeMap.set(entry.imageId, types);
    }
  }
  for (const [imageId, types] of typeMap) {
    if (types.size > 1) {
      console.error(
        `エラー: 画像ID「${imageId}」に矛盾する画像種別があります: ${[...types].join(", ")}。この画像IDはスキップされます。`,
      );
    }
  }

  // Check photo file existence for 実写/図解 entries upfront
  const photoFiles = await fs.readdir(photosDir).catch(() => [] as string[]);
  const missingPhotos: string[] = [];
  for (const group of groups) {
    if (group.imageType !== "実写" && group.imageType !== "図解") continue;
    const found = photoFiles.some((f) =>
      path.basename(f).startsWith(group.imageId),
    );
    if (!found) missingPhotos.push(group.imageId);
  }
  if (missingPhotos.length > 0) {
    console.warn(
      `警告: 以下の実写/図解画像ファイルが ${photosDir} に見つかりません: ${missingPhotos.join(", ")}`,
    );
  }
}

async function main() {
  const opts = parseCliArgs();
  await validateInputs(opts);

  console.log("=== YMM画像自動挿入ツール ===");
  console.log(`CSV: ${opts.csv}`);
  console.log(`ymmp: ${opts.ymmp}`);
  console.log(`Photos: ${opts.photos}`);
  console.log(`Output: ${opts.output}`);
  console.log(`Clip: ${opts.clipWidth}x${opts.clipHeight}`);
  if (opts.dryRun) console.log("モード: Dry Run");

  // Read inputs
  console.log("\n--- CSV読み込み ---");
  const imageGroups = await readImageSheet(opts.csv);
  console.log(`画像グループ: ${imageGroups.length}件`);

  // Validate image groups
  await validateImageGroups(imageGroups, opts.photos);

  console.log("\n--- ymmp読み込み ---");
  const data = await readYmmp(opts.ymmp);
  const items = getItems(data);
  const initialItemCount = items.length;
  console.log(`アイテム数: ${initialItemCount}`);

  // Extract voice items and detect chapters
  const voiceItems = findVoiceItems(items);
  console.log(`VoiceItem数: ${voiceItems.length}`);

  if (voiceItems.length === 0) {
    console.warn(
      "警告: VoiceItemが0件です。セリフが入っていないymmpの可能性があります。",
    );
  }

  const chapters = detectChapters(items);
  console.log(`チャプター検出: ${chapters.length}区間`);

  if (chapters.length === 0) {
    console.warn(
      "警告: チャプターが検出されませんでした（トランジション・ShapeItemなし）",
    );
  }

  // CSV/ymmp consistency check
  const csvSerifCount = imageGroups.reduce(
    (sum, g) => sum + g.entries.length,
    0,
  );
  if (
    voiceItems.length > 0 &&
    csvSerifCount > 0 &&
    csvSerifCount > voiceItems.length * 2
  ) {
    console.warn(
      `警告: CSVのセリフ数(${csvSerifCount})がymmpのVoiceItem数(${voiceItems.length})の2倍を超えています。CSV/ymmpのバージョン不一致の可能性があります。`,
    );
  }

  // Match CSV entries to voice items
  console.log("\n--- セリフマッチング ---");
  const { blocks, failures } = matchEntries(imageGroups, voiceItems);
  const matchRate =
    imageGroups.length > 0 ? blocks.length / imageGroups.length : 0;
  console.log(`マッチ成功: ${blocks.length}/${imageGroups.length}`);

  if (failures.length > 0) {
    console.log(`マッチ失敗: ${failures.length}件`);
    for (const f of failures) {
      const serifPreview =
        f.serif.length > 30 ? f.serif.slice(0, 30) + "..." : f.serif;
      console.log(
        `  ❌ 画像ID: ${f.imageId} | セリフ: "${serifPreview}" → ${f.reason}`,
      );
    }
  }

  // Alert on low match rate
  if (imageGroups.length > 5 && matchRate < 0.5) {
    console.warn(
      `\n⚠ 警告: マッチ成功率が${(matchRate * 100).toFixed(0)}%と低いです。CSVとymmpのバージョン不一致の可能性があります。`,
    );
  }

  // Count by type
  const aiBlocks = blocks.filter((b) => b.group.imageType === "AI");
  const photoBlocks = blocks.filter(
    (b) => b.group.imageType === "実写" || b.group.imageType === "図解",
  );

  if (opts.dryRun) {
    // Dry run: preview only
    console.log("\n=== Dry Run プレビュー ===");
    console.log(`チャプター検出: ${chapters.length}区間`);

    console.log("\n挿入プレビュー:");
    for (const block of blocks.sort((a, b) => a.frame - b.frame)) {
      const typeLabel = block.group.imageType;
      const hasRef = block.group.referenceUrl
        ? " + 参考文献テキスト Layer 12"
        : "";
      console.log(
        `  ${block.group.imageId} (${typeLabel}) → Frame ${block.frame}, Length ${block.length} | Layer 11${hasRef}`,
      );
    }

    const aiCount = aiBlocks.length;
    const limitedCount = opts.maxGenerate
      ? Math.min(aiCount, opts.maxGenerate)
      : aiCount;
    const estimatedCost = (limitedCount * 0.06).toFixed(2);

    console.log(
      `\nAI画像生成予定: ${limitedCount}枚 (推定コスト: $${estimatedCost})`,
    );
    if (opts.maxGenerate && aiCount > opts.maxGenerate) {
      console.log(
        `  → 未生成の${aiCount - opts.maxGenerate}枚はymmpへの挿入もスキップ`,
      );
    }
    console.log(`実写/図解画像挿入予定: ${photoBlocks.length}枚`);
    console.log(`スキップ: ${failures.length}枚`);
    return;
  }

  // Step 4: Insert clipping templates
  console.log("\n--- Step 4: クリッピングテンプレート挿入 ---");
  const clippingInserted = step4_insertClipping(data, chapters);
  console.log(`挿入: ${clippingInserted}件`);

  // Step 5: Insert photo/diagram images
  console.log("\n--- Step 5: 実写/図解画像挿入 ---");
  const photoResult = await step5_insertPhotos(
    data,
    blocks,
    opts.photos,
    opts.clipWidth,
    opts.clipHeight,
  );
  console.log(`挿入: ${photoResult.inserted}件`);
  if (photoResult.skipped.length > 0) {
    console.log(`スキップ: ${photoResult.skipped.join(", ")}`);
  }

  // Step 6: Generate AI images
  const apiKey = process.env.GEMINI_API_KEY;
  let aiGenResults: Awaited<ReturnType<typeof step6_generateAi>> = [];
  if (aiBlocks.length > 0) {
    if (!apiKey) {
      console.warn(
        "警告: GEMINI_API_KEY が設定されていません。AI画像生成をスキップします。",
      );
    } else {
      console.log("\n--- Step 6: AI画像生成 ---");
      const aiOutputDir = path.join(path.dirname(opts.output), "ai_images");
      aiGenResults = await step6_generateAi(
        blocks,
        apiKey,
        aiOutputDir,
        opts.maxGenerate,
      );

      // Step 7: Insert AI images
      console.log("\n--- Step 7: AI画像挿入 ---");
      const aiResult = await step7_insertAi(
        data,
        blocks,
        aiOutputDir,
        opts.clipWidth,
        opts.clipHeight,
      );
      console.log(`挿入: ${aiResult.inserted}件`);
      if (aiResult.skipped.length > 0) {
        console.log(`スキップ: ${aiResult.skipped.join(", ")}`);
      }
    }
  }

  // Sort items by Frame
  items.sort((a, b) => a.Frame - b.Frame);

  // Write output
  console.log("\n--- 出力 ---");
  await writeYmmp(opts.output, data);
  console.log(`書き込み完了: ${opts.output}`);

  // Summary
  const aiSuccessCount = aiGenResults.filter((r) => r.success).length;
  const finalItemCount = items.length;
  console.log("\n=== 実行サマリー ===");
  console.log(
    `入力ymmp: ${initialItemCount} items`,
  );
  console.log(
    `出力ymmp: ${finalItemCount} items (+${finalItemCount - initialItemCount})`,
  );
  console.log(`  追加内訳:`);
  console.log(`    ShapeItem (クリッピング): +${clippingInserted}`);
  console.log(
    `    ImageItem (挿絵):         +${photoResult.inserted + aiSuccessCount}`,
  );

  const refCount = blocks.filter(
    (b) =>
      (b.group.imageType === "実写" || b.group.imageType === "図解") &&
      b.group.referenceUrl,
  ).length;
  console.log(`    TextItem (参考文献):       +${refCount}`);
  console.log(
    `\nセリフマッチング: ${blocks.length}/${imageGroups.length} 成功`,
  );

  if (aiBlocks.length > 0) {
    const aiLimited = aiGenResults.filter(
      (r) => !r.success && r.error?.includes("制限"),
    ).length;
    if (opts.maxGenerate) {
      console.log(
        `AI画像生成: ${aiSuccessCount}/${aiBlocks.length} (--max-generate ${opts.maxGenerate} 制限)`,
      );
      if (aiLimited > 0) {
        console.log(
          `  → 未生成の${aiLimited}枚はymmpへの挿入もスキップ`,
        );
      }
    } else {
      const aiSkipped = aiGenResults.filter(
        (r) => r.success && !r.filePath,
      ).length;
      console.log(
        `AI画像生成: ${aiSuccessCount}/${aiBlocks.length} 成功 (スキップ: ${aiSkipped})`,
      );
    }
  }
  console.log(
    `実写/図解画像挿入: ${photoResult.inserted}/${photoBlocks.length} 成功`,
  );
}

main().catch((err) => {
  console.error("エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
