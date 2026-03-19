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
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1a1a1a; padding: 12px 0; border-bottom: 1px solid #333; margin-bottom: 20px; display: flex; justify-content: center; gap: 12px; align-items: center; flex-wrap: wrap; }
  .toolbar .selected-count { color: #3498db; font-weight: bold; min-width: 80px; }
  .toolbar button { background: #3498db; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .toolbar button:hover { background: #2980b9; }
  .toolbar button:disabled { background: #555; cursor: not-allowed; }
  .toolbar button.clear { background: #e74c3c; }
  .toolbar button.clear:hover { background: #c0392b; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px; }
  .card { background: #2a2a2a; border-radius: 8px; overflow: hidden; position: relative; cursor: pointer; transition: outline 0.15s; }
  .card.missing { border: 2px solid #e74c3c; }
  .card.selected { outline: 3px solid #3498db; }
  .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
  .card .placeholder { width: 100%; aspect-ratio: 16/9; background: #444; display: flex; align-items: center; justify-content: center; color: #e74c3c; font-size: 18px; }
  .card .checkbox { position: absolute; top: 8px; left: 8px; width: 24px; height: 24px; background: rgba(0,0,0,0.6); border: 2px solid #888; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .card.selected .checkbox { background: #3498db; border-color: #3498db; }
  .card .info { padding: 10px; }
  .card .id { font-weight: bold; font-size: 18px; color: #3498db; }
  .card .desc { margin-top: 4px; color: #ccc; font-size: 14px; }
  .card .prompt { margin-top: 4px; color: #888; font-size: 12px; }
  .card .prompt details summary { cursor: pointer; }
  .regen-ids { text-align: center; margin-top: 20px; padding: 16px; background: #2a2a2a; border-radius: 8px; }
  .regen-ids code { background: #444; padding: 8px 16px; border-radius: 4px; font-size: 14px; user-select: all; }
  .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #27ae60; color: #fff; padding: 10px 24px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<h1>AI画像プレビュー</h1>
<div class="stats">
  生成済み: ${rows.filter((r) => r.exists).length}/${rows.length}枚
  | 欠損: ${rows.filter((r) => !r.exists).length}枚
</div>

<div class="toolbar">
  <span class="selected-count" id="selectedCount">0件選択</span>
  <button id="copyIds" disabled>IDをコピー</button>
  <button id="copyRegen" disabled>--regenerate をコピー</button>
  <button id="selectAll">全選択</button>
  <button id="clearAll" class="clear" disabled>選択解除</button>
</div>

${rows.filter((r) => !r.exists).length > 0 ? `<div class="regen-ids">
  欠損画像の再生成コマンド:<br><br>
  <code>--regenerate ${rows.filter((r) => !r.exists).map((r) => r.imageId).join(",")}</code>
</div>` : ""}
<div class="grid">
${rows
  .map(
    (r) => `  <div class="card${r.exists ? "" : " missing"}" data-id="${r.imageId}">
    <div class="checkbox"></div>
    ${r.imagePath ? `<img src="file://${r.imagePath}" alt="${r.imageId}">` : '<div class="placeholder">未生成</div>'}
    <div class="info">
      <div class="id">#${r.imageId}</div>
      <div class="desc">${escapeHtml(r.description)}</div>
      <div class="prompt"><details><summary>プロンプト</summary>${escapeHtml(r.prompt)}</details></div>
    </div>
  </div>`,
  )
  .join("\n")}
</div>
<div class="toast" id="toast"></div>
<script>
const selected = new Set();
const cards = document.querySelectorAll('.card');
const countEl = document.getElementById('selectedCount');
const copyIdsBtn = document.getElementById('copyIds');
const copyRegenBtn = document.getElementById('copyRegen');
const selectAllBtn = document.getElementById('selectAll');
const clearAllBtn = document.getElementById('clearAll');
const toast = document.getElementById('toast');

function updateUI() {
  countEl.textContent = selected.size + '件選択';
  copyIdsBtn.disabled = selected.size === 0;
  copyRegenBtn.disabled = selected.size === 0;
  clearAllBtn.disabled = selected.size === 0;
  cards.forEach(c => c.classList.toggle('selected', selected.has(c.dataset.id)));
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

cards.forEach(card => {
  card.addEventListener('click', (e) => {
    if (e.target.tagName === 'SUMMARY' || e.target.tagName === 'DETAILS') return;
    const id = card.dataset.id;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    updateUI();
  });
});

copyIdsBtn.addEventListener('click', () => {
  const ids = [...selected].sort((a,b) => parseInt(a) - parseInt(b)).join(',');
  navigator.clipboard.writeText(ids);
  showToast('コピー: ' + ids);
});

copyRegenBtn.addEventListener('click', () => {
  const ids = [...selected].sort((a,b) => parseInt(a) - parseInt(b)).join(',');
  const text = '--regenerate ' + ids;
  navigator.clipboard.writeText(text);
  showToast('コピー: ' + text);
});

selectAllBtn.addEventListener('click', () => {
  cards.forEach(c => selected.add(c.dataset.id));
  updateUI();
});

clearAllBtn.addEventListener('click', () => {
  selected.clear();
  updateUI();
});
</script>
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
