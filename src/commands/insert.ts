import path from "node:path";
import fs from "node:fs/promises";
import { parseInsertArgs, validateInputs, validateImageGroups, confirm } from "../cli.ts";
import { readImageSheet } from "../csv-reader.ts";
import {
  readYmmp,
  writeYmmp,
  getItems,
  findVoiceItems,
  detectChapters,
} from "../ymmp.ts";
import { matchEntries } from "../matcher.ts";
import {
  step4_insertClipping,
  step5_insertPhotos,
  step6_generateAi,
  step7_insertAi,
} from "../steps.ts";
import { generatePreviewHtml } from "../preview.ts";
import { makeRemark } from "../util.ts";

/**
 * Delete AI image files for specified IDs so they can be regenerated.
 */
async function deleteRegenerateTargets(
  aiOutputDir: string,
  ids: string[],
): Promise<number> {
  let deleted = 0;
  try {
    const files = await fs.readdir(aiOutputDir);
    for (const file of files) {
      const base = path.basename(file, path.extname(file)).split("_")[0];
      if (ids.includes(base)) {
        await fs.unlink(path.join(aiOutputDir, file));
        console.log(`  削除: ${file}`);
        deleted++;
      }
    }
  } catch {
    // Directory doesn't exist yet, nothing to delete
  }
  return deleted;
}

export async function runInsert(args: string[]) {
  const opts = parseInsertArgs(args);
  await validateInputs(opts);

  console.log("=== YMM画像自動挿入ツール ===");
  console.log(`CSV: ${opts.csv}`);
  console.log(`ymmp: ${opts.ymmp}`);
  console.log(`Photos: ${opts.photos}`);
  console.log(`Output: ${opts.output}`);
  console.log(`Clip: ${opts.clipWidth}x${opts.clipHeight}`);
  if (opts.style) console.log(`Style: ${opts.style}`);
  if (opts.negative) console.log(`Negative: ${opts.negative}`);
  if (opts.dryRun) console.log("モード: Dry Run");
  if (opts.regenerate) console.log(`再生成対象: ${opts.regenerate.join(", ")}`);
  if (opts.prompt) console.log(`カスタムプロンプト: ${opts.prompt}`);

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

  // Warn if any block spans across chapter boundaries
  if (chapters.length > 1) {
    const chapterStarts = chapters.map((c) => c.frame).sort((a, b) => a - b);
    for (const block of blocks) {
      const blockEnd = block.frame + block.length;
      for (const cs of chapterStarts) {
        if (cs > block.frame && cs < blockEnd) {
          const serifPreview =
            block.group.entries[0]?.serif.slice(0, 30) ?? "";
          console.warn(
            `⚠ 警告: 画像ID ${block.group.imageId} がチャプター境界(Frame ${cs})を跨いでいます (Frame ${block.frame}〜${blockEnd}) | セリフ: "${serifPreview}..."`,
          );
        }
      }
    }
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
    const sortedBlocks = blocks.sort((a, b) => a.frame - b.frame);
    const fps = 60;
    for (const block of sortedBlocks) {
      const typeLabel = block.group.imageType;
      const hasRef = block.group.referenceUrl
        ? " + 参考文献テキスト Layer 12"
        : "";
      const durationSec = (block.length / fps).toFixed(1);
      const serifCount = block.group.entries.length;
      console.log(
        `  ${block.group.imageId} (${typeLabel}) → Frame ${block.frame}, Length ${block.length} (${durationSec}s, セリフ${serifCount}件) | Layer 11${hasRef}`,
      );
    }

    const aiCount = aiBlocks.length;
    const limitedCount = opts.maxGenerate
      ? Math.min(aiCount, opts.maxGenerate)
      : aiCount;
    const estimatedCost = (limitedCount * 0.06).toFixed(2);

    // Summary by type
    const refCount = blocks.filter((b) => b.group.referenceUrl).length;
    console.log("\n--- 挿入サマリー ---");
    console.log(`  ShapeItem (クリッピング Layer 10): ${blocks.length}件`);
    console.log(`  AI画像 (Layer 11):                 ${aiCount}枚 → 生成予定: ${limitedCount}枚 (推定コスト: $${estimatedCost})`);
    if (opts.maxGenerate && aiCount > opts.maxGenerate) {
      console.log(
        `    → 未生成の${aiCount - opts.maxGenerate}枚はymmpへの挿入もスキップ`,
      );
    }
    console.log(`  実写/図解画像 (Layer 11):          ${photoBlocks.length}枚`);
    console.log(`  参考文献テキスト (Layer 12):       ${refCount}件`);
    console.log(`  マッチ失敗スキップ:                ${failures.length}枚`);
    return;
  }

  // Handle --regenerate: delete specified AI images and their ymmp items
  const aiOutputDir = path.join(path.dirname(opts.output), "ai_images");
  if (opts.regenerate) {
    console.log("\n--- 再生成: 既存画像・アイテム削除 ---");
    const deletedFiles = await deleteRegenerateTargets(aiOutputDir, opts.regenerate);

    // Also remove corresponding items from ymmp so they can be re-inserted
    let deletedItems = 0;
    for (const id of opts.regenerate) {
      const remark = makeRemark(id);
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i]!.Remark === remark) {
          items.splice(i, 1);
          deletedItems++;
        }
      }
    }
    console.log(`画像ファイル削除: ${deletedFiles}件`);
    console.log(`ymmpアイテム削除: ${deletedItems}件`);

    // Override AI prompt for regenerate targets if --prompt is specified
    if (opts.prompt) {
      for (const block of blocks) {
        if (opts.regenerate!.includes(block.group.imageId) && block.group.imageType === "AI") {
          block.group.aiPrompt = opts.prompt;
        }
      }
      console.log(`プロンプト上書き: ${opts.regenerate!.length}件`);
    }
  }

  // Step 4: Insert clipping backgrounds per image block
  console.log("\n--- Step 4: クリッピング背景挿入 ---");
  const clippingInserted = step4_insertClipping(data, blocks);
  console.log(`挿入: ${clippingInserted}件`);

  // Step 5: Insert photo/diagram images
  console.log("\n--- Step 5: 実写/図解画像挿入 ---");
  const resizedDir = path.join(path.dirname(opts.output), "resized_images");
  const photoResult = await step5_insertPhotos(
    data,
    blocks,
    opts.photos,
    resizedDir,
  );
  console.log(`挿入: ${photoResult.inserted}件`);
  if (photoResult.skipped.length > 0) {
    console.log(`スキップ: ${photoResult.skipped.join(", ")}`);
  }

  // Step 6: Generate AI images
  const apiKey = process.env.GEMINI_API_KEY;
  let aiGenResults: Awaited<ReturnType<typeof step6_generateAi>> = [];
  let aiInsertResult: { inserted: number; skipped: string[] } = { inserted: 0, skipped: [] };
  if (aiBlocks.length > 0) {
    if (!apiKey) {
      console.warn(
        "警告: GEMINI_API_KEY が設定されていません。AI画像生成をスキップします。",
      );
    } else {
      console.log("\n--- Step 6: AI画像生成 ---");
      aiGenResults = await step6_generateAi(
        blocks,
        apiKey,
        aiOutputDir,
        opts.style,
        opts.negative,
        opts.maxGenerate,
      );

      // Generate preview HTML and open in browser
      const previewPath = await generatePreviewHtml(aiOutputDir, blocks);
      console.log(`\nプレビュー: ${previewPath}`);
      Bun.spawn(["open", previewPath], { stdout: "ignore", stderr: "ignore" });

      // Step 7: Insert AI images
      const aiSuccessful = aiGenResults.filter((r) => r.success).length;
      const aiTotal = aiBlocks.length;

      if (aiSuccessful === 0) {
        console.log(`\n--- Step 7: AI画像挿入スキップ (生成済み画像なし) ---`);
      } else {
        // Confirmation before insertion (skip if -y flag)
        let shouldInsert = opts.yes;
        if (!shouldInsert) {
          console.log(`\n生成済みAI画像: ${aiSuccessful}/${aiTotal}枚`);
          shouldInsert = await confirm("ymmpにAI画像を挿入しますか?");
        }

        if (shouldInsert) {
          console.log("\n--- Step 7: AI画像挿入 ---");
          aiInsertResult = await step7_insertAi(
            data,
            blocks,
            aiOutputDir,
          );
          console.log(`挿入: ${aiInsertResult.inserted}件`);
          if (aiInsertResult.skipped.length > 0) {
            console.log(`スキップ (ファイル未検出): ${aiInsertResult.skipped.join(", ")}`);
          }
        } else {
          console.log("\n--- Step 7: AI画像挿入スキップ (ユーザーキャンセル) ---");
        }
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
    `    ImageItem (挿絵):         +${photoResult.inserted + aiInsertResult.inserted}`,
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
