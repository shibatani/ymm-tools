import path from "node:path";
import fs from "node:fs/promises";
import type { ImageBlock } from "./types.ts";

/**
 * Generate a preview HTML file showing all AI-generated images with their IDs and descriptions.
 * Makes it easy to visually review images and identify ones to regenerate.
 */
export async function generatePreviewHtml(
  aiOutputDir: string,
  blocks: ImageBlock[],
): Promise<string> {
  const aiBlocks = blocks
    .filter((b) => b.group.imageType === "AI")
    .sort((a, b) => parseInt(a.group.imageId) - parseInt(b.group.imageId));

  const outputFiles = await fs.readdir(aiOutputDir).catch(() => [] as string[]);

  const rows = aiBlocks.map((block) => {
    const imageFile = outputFiles.find((f) => {
      const base = path.basename(f, path.extname(f)).split("_")[0];
      return base === block.group.imageId;
    });

    const imagePath = imageFile
      ? path.resolve(aiOutputDir, imageFile)
      : null;

    return {
      imageId: block.group.imageId,
      description: block.group.description,
      prompt: block.group.aiPrompt,
      imagePath,
      exists: !!imageFile,
    };
  });

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>AI画像プレビュー</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #1a1a1a; color: #eee; margin: 0; padding: 20px; }
  h1 { text-align: center; margin-bottom: 10px; }
  .stats { text-align: center; margin-bottom: 20px; color: #aaa; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px; }
  .card { background: #2a2a2a; border-radius: 8px; overflow: hidden; }
  .card.missing { border: 2px solid #e74c3c; }
  .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
  .card .placeholder { width: 100%; aspect-ratio: 16/9; background: #444; display: flex; align-items: center; justify-content: center; color: #e74c3c; font-size: 18px; }
  .card .info { padding: 10px; }
  .card .id { font-weight: bold; font-size: 18px; color: #3498db; }
  .card .desc { margin-top: 4px; color: #ccc; font-size: 14px; }
  .card .prompt { margin-top: 4px; color: #888; font-size: 12px; max-height: 60px; overflow: hidden; }
  .regen-ids { text-align: center; margin-top: 20px; padding: 16px; background: #2a2a2a; border-radius: 8px; }
  .regen-ids code { background: #444; padding: 8px 16px; border-radius: 4px; font-size: 14px; user-select: all; }
</style>
</head>
<body>
<h1>AI画像プレビュー</h1>
<div class="stats">
  生成済み: ${rows.filter((r) => r.exists).length}/${rows.length}枚
  | 欠損: ${rows.filter((r) => !r.exists).length}枚
</div>
${rows.filter((r) => !r.exists).length > 0 ? `<div class="regen-ids">
  欠損画像の再生成コマンド:<br><br>
  <code>--regenerate ${rows.filter((r) => !r.exists).map((r) => r.imageId).join(",")}</code>
</div>` : ""}
<div class="grid">
${rows
  .map(
    (r) => `  <div class="card${r.exists ? "" : " missing"}">
    ${r.imagePath ? `<img src="file://${r.imagePath}" alt="${r.imageId}">` : '<div class="placeholder">未生成</div>'}
    <div class="info">
      <div class="id">#${r.imageId}</div>
      <div class="desc">${escapeHtml(r.description)}</div>
      <div class="prompt">${escapeHtml(r.prompt)}</div>
    </div>
  </div>`,
  )
  .join("\n")}
</div>
</body>
</html>`;

  const outputPath = path.join(aiOutputDir, "preview.html");
  await Bun.write(outputPath, html);
  return outputPath;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
