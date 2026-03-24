import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { readImageSheet } from "../csv-reader.ts";
import { confirm } from "../cli.ts";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../constants.ts";

const ALL_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

/** Normalize Unicode (macOS NFD → NFC) */
const norm = (s: string) => s.normalize("NFC");

interface RenameAction {
  status: "rename" | "already" | "missing" | "duplicate";
  imageId: string;
  description: string;
  from?: string;
  to?: string;
  candidates?: string[];
}

function parseRenameArgs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      csv: { type: "string" },
      photos: { type: "string" },
    },
    strict: true,
  });

  if (!values.csv || !values.photos) {
    console.error(
      "使用法: bun run src/cli.ts rename --csv <path> --photos <dir>",
    );
    process.exit(1);
  }

  return {
    csv: path.resolve(values.csv),
    photos: path.resolve(values.photos),
  };
}

export async function runRename(args: string[]) {
  const opts = parseRenameArgs(args);

  console.log("=== 画像リネームツール ===");
  console.log(`CSV: ${opts.csv}`);
  console.log(`Photos: ${opts.photos}`);

  // Read CSV
  const imageGroups = await readImageSheet(opts.csv);
  const targets = imageGroups.filter(
    (g) => g.imageType === "実写" || g.imageType === "図解",
  );

  if (targets.length === 0) {
    console.log("実写/図解の画像グループがありません。");
    return;
  }

  // List files in photos dir
  const allFiles = await fs.readdir(opts.photos);
  const imageFiles = allFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ALL_EXTENSIONS.has(ext);
  });

  // Build rename plan
  const actions: RenameAction[] = [];

  for (const group of targets) {
    const { imageId, description } = group;

    // Check if already renamed (imageId.ext exists)
    const alreadyRenamed = imageFiles.find((f) => {
      const name = path.basename(f, path.extname(f));
      return norm(name) === norm(imageId);
    });
    if (alreadyRenamed) {
      actions.push({ status: "already", imageId, description, from: alreadyRenamed });
      continue;
    }

    // Find candidates matching description
    const descNorm = norm(description);
    const candidates = imageFiles.filter((f) => {
      const name = norm(path.basename(f, path.extname(f)));
      return name === descNorm;
    });

    if (candidates.length === 0) {
      actions.push({ status: "missing", imageId, description });
    } else if (candidates.length > 1) {
      actions.push({ status: "duplicate", imageId, description, candidates });
    } else {
      const from = candidates[0]!;
      const ext = path.extname(from);
      const to = `${imageId}${ext}`;
      actions.push({ status: "rename", imageId, description, from, to });
    }
  }

  // Check for rename target conflicts (multiple descriptions mapping to same imageId)
  const renameTargets = actions.filter((a) => a.status === "rename");
  const toNames = renameTargets.map((a) => a.to!);
  const duplicateToNames = toNames.filter((t, i) => toNames.indexOf(t) !== i);
  if (duplicateToNames.length > 0) {
    console.warn(`\n⚠ リネーム先の重複: ${[...new Set(duplicateToNames)].join(", ")}`);
  }

  // Display preview
  console.log("\n=== リネームプレビュー ===");
  for (const action of actions) {
    switch (action.status) {
      case "rename":
        console.log(`  ✅ ${action.from} → ${action.to}`);
        break;
      case "already":
        console.log(`  ⏭ ${action.from} (リネーム済み)`);
        break;
      case "missing":
        console.log(`  ❌ ${action.imageId} ← "${action.description}" → ファイル未検出`);
        break;
      case "duplicate":
        console.log(`  ⚠ ${action.imageId} ← "${action.description}" → 複数候補: ${action.candidates!.join(", ")}`);
        break;
    }
  }

  // Summary
  const renameCount = actions.filter((a) => a.status === "rename").length;
  const alreadyCount = actions.filter((a) => a.status === "already").length;
  const missingCount = actions.filter((a) => a.status === "missing").length;
  const duplicateCount = actions.filter((a) => a.status === "duplicate").length;
  console.log(
    `\nリネーム: ${renameCount}, リネーム済み: ${alreadyCount}, 未検出: ${missingCount}, 複数候補: ${duplicateCount}`,
  );

  if (renameCount === 0) {
    console.log("リネーム対象がありません。");
    return;
  }

  // Confirm
  const shouldRename = await confirm("リネームを実行しますか?");
  if (!shouldRename) {
    console.log("キャンセルしました。");
    return;
  }

  // Execute renames
  console.log("\n--- リネーム実行 ---");
  let success = 0;
  for (const action of actions) {
    if (action.status !== "rename") continue;
    const fromPath = path.join(opts.photos, action.from!);
    const toPath = path.join(opts.photos, action.to!);
    await fs.rename(fromPath, toPath);
    console.log(`  ${action.from} → ${action.to}`);
    success++;
  }
  console.log(`\n完了: ${success}件リネーム`);
}
