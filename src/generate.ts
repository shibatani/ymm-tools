import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateImages } from "./imagen.ts";
import { DEFAULT_STYLE, DEFAULT_NEGATIVE, DESC_MAX_LENGTH } from "./constants.ts";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    output: { type: "string", short: "o" },
    style: { type: "string" },
    negative: { type: "string" },
    "no-style": { type: "boolean", default: false },
    "no-negative": { type: "boolean", default: false },
    "image-id": { type: "string" },
  },
  allowPositionals: true,
  strict: true,
});

const prompt = positionals.join(" ");
if (!prompt) {
  console.error(
    "使用法: bun run src/generate.ts <prompt> [-o output_dir] [--style <prefix>] [--negative <suffix>] [--no-style] [--no-negative] [--image-id <id>]",
  );
  process.exit(1);
}

const outputDir = path.resolve(values.output ?? "./generated_images");
const style = values["no-style"] ? "" : (values.style ?? DEFAULT_STYLE);
const negative = values["no-negative"] ? "" : (values.negative ?? DEFAULT_NEGATIVE);
const imageId = values["image-id"] ?? "gen";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("エラー: GEMINI_API_KEY が設定されていません。");
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });

// Build full prompt
let fullPrompt = prompt;
if (style) fullPrompt = `${style}, ${fullPrompt}`;
if (negative) fullPrompt = `${fullPrompt}. ${negative}`;

const safeDesc = prompt.replace(/[/\\:*?"<>|]/g, "_").slice(0, DESC_MAX_LENGTH);
const outputPath = path.join(outputDir, `${imageId}_${safeDesc}.jpg`);

console.log(`モデル: gemini-flash`);
if (style) console.log(`スタイル: ${style}`);
if (negative) console.log(`ネガティブ: ${negative}`);
console.log(`プロンプト: ${fullPrompt}`);
console.log(`出力先: ${outputPath}`);

const results = await generateImages(
  [{ imageId, prompt: fullPrompt, outputPath, description: prompt }],
  apiKey,
);

if (results[0]?.success) {
  console.log(`\n✅ 生成完了: ${results[0].filePath}`);
} else {
  console.error(`\n❌ 生成失敗: ${results[0]?.error}`);
  process.exit(1);
}
