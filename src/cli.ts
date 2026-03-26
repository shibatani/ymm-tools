import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import type { CliOptions, ImageGroup } from "./types.ts";
import { CLIP_WIDTH, CLIP_HEIGHT } from "./util.ts";
import { DEFAULT_STYLE, DEFAULT_NEGATIVE } from "./constants.ts";
import { runInsert } from "./commands/insert.ts";
import { runTemplate } from "./commands/template.ts";
import { runFind } from "./commands/find.ts";
import { runRename } from "./commands/rename.ts";

export function parseInsertArgs(args: string[]): CliOptions {
  const { values } = parseArgs({
    args,
    options: {
      csv: { type: "string" },
      ymmp: { type: "string" },
      photos: { type: "string" },
      output: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "max-generate": { type: "string" },
      "clip-width": { type: "string" },
      "clip-height": { type: "string" },
      style: { type: "string" },
      negative: { type: "string" },
      regenerate: { type: "string" },
      prompt: { type: "string" },
      yes: { type: "boolean", short: "y", default: false },
    },
    strict: true,
  });

  if (!values.csv || !values.ymmp || !values.photos || !values.output) {
    console.error(
      "使用法: bun run src/cli.ts insert --csv <path> --ymmp <path> --photos <dir> --output <path> [--dry-run] [--max-generate N] [--clip-width N] [--clip-height N] [--style <prefix>] [--negative <suffix>] [--regenerate 1,2,3] [--prompt <text>] [-y]",
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
    style: values.style ?? DEFAULT_STYLE,
    negative: values.negative ?? DEFAULT_NEGATIVE,
    regenerate: values.regenerate
      ? values.regenerate.split(",").map((s) => s.trim())
      : undefined,
    prompt: values.prompt ?? undefined,
    yes: values.yes ?? false,
  };
}

export async function validateInputs(opts: CliOptions): Promise<void> {
  if (!(await Bun.file(opts.csv).exists())) {
    throw new Error(`CSVファイルが見つかりません: ${opts.csv}`);
  }
  if (!(await Bun.file(opts.ymmp).exists())) {
    throw new Error(`ymmpファイルが見つかりません: ${opts.ymmp}`);
  }

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

  if (opts.output === opts.ymmp && !opts.regenerate) {
    throw new Error("出力先パスは入力ymmpと異なるパスを指定してください");
  }
}

export async function validateImageGroups(
  groups: ImageGroup[],
  photosDir: string,
): Promise<void> {
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

  const photoFiles = await fs.readdir(photosDir).catch(() => [] as string[]);
  const missingPhotos: string[] = [];
  for (const group of groups) {
    if (group.imageType !== "実写" && group.imageType !== "図解") continue;
    const found = photoFiles.some((f) => {
      const name = path.basename(f);
      const ext = path.extname(f);
      return name === group.imageId + ext;
    });
    if (!found) missingPhotos.push(group.imageId);
  }
  if (missingPhotos.length > 0) {
    console.warn(
      `警告: 以下の実写/図解画像ファイルが ${photosDir} に見つかりません: ${missingPhotos.join(", ")}`,
    );
  }
}

/**
 * Ask user for confirmation via stdin. Returns true if user confirms.
 */
export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} (y/N): `);
  for await (const line of console) {
    const answer = line.trim().toLowerCase();
    return answer === "y" || answer === "yes";
  }
  return false;
}

// --- Subcommand dispatch ---
async function main() {
  const subcommand = Bun.argv[2];
  const restArgs = Bun.argv.slice(3);

  switch (subcommand) {
    case "insert":
      await runInsert(restArgs);
      break;
    case "template":
      await runTemplate(restArgs);
      break;
    case "find":
      await runFind(restArgs);
      break;
    case "rename":
      await runRename(restArgs);
      break;
    default:
      console.error("使用法: ymm-tools <insert|template|find|rename> [options]");
      console.error("  insert    - 画像自動挿入");
      console.error("  template  - テンプレート生成");
      console.error("  find      - 動画名でファイル検索");
      console.error("  rename    - 実写/図解画像のリネーム");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
