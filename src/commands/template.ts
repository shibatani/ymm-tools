import { parseArgs } from "node:util";
import path from "node:path";
import { readSectionSheet } from "../csv-reader.ts";
import { readYmmp, writeYmmp, getItems, findVoiceItems } from "../ymmp.ts";
import { extractSections, matchSections } from "../section.ts";
import {
  buildTitleCardItems,
  buildContentSectionItems,
  selectBgm,
} from "../template-builder.ts";
import { TITLE_CARD_LENGTH, TMPL_LAYER } from "../constants.ts";
import { applyExpressions } from "../expression.ts";
import type { YmmpItem } from "../types.ts";

interface TemplateOptions {
  csv: string;
  ymmp: string;
  output: string;
  dryRun: boolean;
}

function parseTemplateArgs(args: string[]): TemplateOptions {
  const { values } = parseArgs({
    args,
    options: {
      csv: { type: "string" },
      ymmp: { type: "string" },
      output: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.csv || !values.ymmp || (!values.output && !values["dry-run"])) {
    console.error(
      "使用法: bun run src/cli.ts template --csv <path> --ymmp <path> --output <path> [--dry-run]",
    );
    process.exit(1);
  }

  return {
    csv: path.resolve(values.csv),
    ymmp: path.resolve(values.ymmp),
    output: values.output ? path.resolve(values.output) : "",
    dryRun: values["dry-run"] ?? false,
  };
}

export async function runTemplate(args: string[]) {
  const opts = parseTemplateArgs(args);

  console.log("=== YMM テンプレート生成ツール ===");
  console.log(`CSV: ${opts.csv}`);
  console.log(`ymmp: ${opts.ymmp}`);
  if (!opts.dryRun) console.log(`Output: ${opts.output}`);
  if (opts.dryRun) console.log("モード: Dry Run");

  if (!opts.dryRun && opts.output === opts.ymmp) {
    throw new Error("出力先パスは入力ymmpと異なるパスを指定してください");
  }

  // Step 1: CSV 読み込み
  console.log("\n--- CSV読み込み ---");
  const csvEntries = await readSectionSheet(opts.csv);
  console.log(`行数: ${csvEntries.length}件`);

  // Step 2: ymmp 読み込み
  console.log("\n--- ymmp読み込み ---");
  const data = await readYmmp(opts.ymmp);
  const items = getItems(data);
  const initialItemCount = items.length;
  console.log(`アイテム数: ${initialItemCount}`);

  // Step 3: セクション定義を抽出
  console.log("\n--- セクション検出 ---");
  const sectionDefs = extractSections(csvEntries);
  console.log(`セクション定義: ${sectionDefs.length}件`);

  // Step 4: VoiceItem マッチング
  const voiceItems = findVoiceItems(items);
  console.log(`VoiceItem数: ${voiceItems.length}`);

  if (voiceItems.length === 0) {
    throw new Error("VoiceItem が見つかりません");
  }

  const sections = matchSections(sectionDefs, voiceItems);
  console.log(`マッチ成功: ${sections.length}件`);

  const fps = 60;
  for (const s of sections) {
    const titleLabel = s.titleCard ? `TC:"${s.titleCard}"` : "TC:なし";
    const stLabel = s.sectionTitle || "(タイトルなし)";
    const durationSec = (s.length / fps).toFixed(1);
    console.log(`  ${stLabel} → Frame ${s.frame}, Length ${s.length} (${durationSec}s) | ${titleLabel}`);
  }

  // Step 4.5: 表情適用
  console.log("\n--- 表情適用 ---");
  const expressionResult = applyExpressions(csvEntries, voiceItems, items, opts.dryRun);

  if (expressionResult.unknownExpressions.length > 0) {
    console.warn(`⚠ 未定義の表情名: ${expressionResult.unknownExpressions.join(", ")}`);
    console.warn("  → 対応する表情: 焦り, にやり, 驚き, 悲しみ, 泣く, 怒り");
  }

  if (expressionResult.applied.length > 0) {
    console.log(`適用: ${expressionResult.applied.length}件 / スキップ(通常): ${expressionResult.skipped}件`);
    for (const m of expressionResult.applied) {
      const serifPreview = m.serif.length > 25 ? m.serif.slice(0, 25) + "..." : m.serif;
      console.log(`  [${m.character}] 「${serifPreview}」 → ${m.expression}`);
    }
    if (expressionResult.unmatched.length > 0) {
      console.log(`マッチ失敗: ${expressionResult.unmatched.length}件`);
      for (const u of expressionResult.unmatched) {
        const serifPreview = u.serif.length > 25 ? u.serif.slice(0, 25) + "..." : u.serif;
        console.log(`  ❌ [${u.character}] 「${serifPreview}」 → ${u.expression}`);
      }
    }
    // Expression summary by type
    const counts = new Map<string, number>();
    for (const m of expressionResult.applied) {
      counts.set(m.expression, (counts.get(m.expression) ?? 0) + 1);
    }
    const summary = [...counts.entries()].map(([k, v]) => `${k}: ${v}件`).join(" / ");
    console.log(`表情サマリー: ${summary}`);
  } else {
    console.log("表情列なし、または全て通常表情");
  }

  if (opts.dryRun) {
    const titleCardCount = sections.filter((s) => s.titleCard).length;
    const totalShift = titleCardCount * TITLE_CARD_LENGTH;
    console.log("\n=== Dry Run サマリー ===");
    console.log(`  セクション数: ${sections.length}件`);
    console.log(`  タイトルカード: ${titleCardCount}件 → フレームシフト: +${totalShift}f`);
    console.log(`  VoiceItem数: ${voiceItems.length}件 (Layer 1→${TMPL_LAYER.VOICE_1}, 2→${TMPL_LAYER.VOICE_2} に移動予定)`);
    console.log(`  生成予定アイテム: タイトルカード ${titleCardCount * 5}件 + コンテンツセクション ${sections.length}件`);
    console.log(`  表情適用: ${expressionResult.applied.length}件`);
    return;
  }

  // Step 5: フレームシフト計算
  console.log("\n--- フレームシフト ---");
  let cumulativeShift = 0;
  const shiftPoints: { originalFrame: number; shift: number }[] = [];

  for (const section of sections) {
    if (section.titleCard) {
      shiftPoints.push({
        originalFrame: section.frame,
        shift: cumulativeShift,
      });
      cumulativeShift += TITLE_CARD_LENGTH;
    }
  }
  console.log(`タイトルカード: ${shiftPoints.length}枚 → 累積シフト: +${cumulativeShift}f`);

  // Step 6: VoiceItem のフレーム位置を更新
  // Sort shift points by frame descending to apply from back to front
  const sortedShiftPoints = [...shiftPoints].sort((a, b) => b.originalFrame - a.originalFrame);

  const voiceItemsInYmmp = items.filter(
    (item) => item.$type?.includes("VoiceItem"),
  );

  for (const sp of sortedShiftPoints) {
    for (const vi of voiceItemsInYmmp) {
      if (vi.Frame >= sp.originalFrame) {
        vi.Frame += TITLE_CARD_LENGTH;
      }
    }
  }

  // Step 7: VoiceItem レイヤー移動 (Layer 1→8, 2→9)
  console.log("\n--- VoiceItem レイヤー移動 ---");
  let movedCount = 0;
  for (const vi of voiceItemsInYmmp) {
    if (vi.Layer === 1) {
      vi.Layer = TMPL_LAYER.VOICE_1;
      movedCount++;
    } else if (vi.Layer === 2) {
      vi.Layer = TMPL_LAYER.VOICE_2;
      movedCount++;
    }
  }
  console.log(`移動: ${movedCount}件 (Layer 1→${TMPL_LAYER.VOICE_1}, 2→${TMPL_LAYER.VOICE_2})`);

  // Step 8: テンプレートアイテム生成
  console.log("\n--- テンプレートアイテム生成 ---");
  const newItems: YmmpItem[] = [];
  let titleCardCount = 0;
  let contentSectionCount = 0;

  // Recompute section frames after shift
  let shiftAccum = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const hasTitleCard = !!section.titleCard;

    // Frame positions after cumulative shift
    const sectionStartFrame = section.frame + shiftAccum;

    if (hasTitleCard) {
      // Insert title card
      const titleCardFrame = sectionStartFrame;
      newItems.push(...buildTitleCardItems(titleCardFrame, section.titleCard));
      titleCardCount++;
      shiftAccum += TITLE_CARD_LENGTH;
    }

    // Content section starts after title card (if any)
    const contentFrame = sectionStartFrame + (hasTitleCard ? TITLE_CARD_LENGTH : 0);

    // Compute content length
    let contentLength: number;
    if (i < sections.length - 1) {
      // Until next section's shifted start
      const nextOrigFrame = sections[i + 1]!.frame;
      const nextShiftedFrame = nextOrigFrame + shiftAccum;
      contentLength = nextShiftedFrame - contentFrame;
    } else {
      // Last section: until the end of all VoiceItems (after shift)
      const lastVoiceEnd = voiceItemsInYmmp.reduce(
        (max, vi) => Math.max(max, vi.Frame + vi.Length),
        0,
      );
      contentLength = lastVoiceEnd - contentFrame;
    }

    const bgmPath = selectBgm(i, sections.length);
    newItems.push(
      ...buildContentSectionItems(contentFrame, contentLength, section.sectionTitle, bgmPath),
    );
    contentSectionCount++;
  }

  console.log(`タイトルカード: ${titleCardCount}件`);
  console.log(`コンテンツセクション: ${contentSectionCount}件`);
  console.log(`生成アイテム合計: ${newItems.length}件`);

  // Step 9: アイテム追加
  items.push(...newItems);

  // Step 10: Frame 順でソート
  items.sort((a, b) => a.Frame - b.Frame);

  // Step 11: 出力
  console.log("\n--- 出力 ---");
  await writeYmmp(opts.output, data);
  console.log(`書き込み完了: ${opts.output}`);

  // Summary
  const finalItemCount = items.length;
  console.log("\n=== 実行サマリー ===");
  console.log(`入力ymmp: ${initialItemCount} items`);
  console.log(`出力ymmp: ${finalItemCount} items (+${finalItemCount - initialItemCount})`);
  console.log(`  タイトルカード: ${titleCardCount}件 (${titleCardCount * 5} items)`);
  console.log(`  コンテンツセクション: ${contentSectionCount}件`);
  console.log(`  VoiceItem レイヤー移動: ${movedCount}件`);
  console.log(`  表情適用: ${expressionResult.applied.length}件`);
  console.log(`  累積フレームシフト: +${cumulativeShift}f`);
}
