import path from "node:path";
import fs from "node:fs/promises";

const WIN_YMM_BASE = "C:\\動画作成\\YMM保存";
const WIN_VM_NAME = "Windows 11";
const MAC_DOWNLOADS = path.join(process.env.HOME ?? "", "Downloads");
const MAC_MOVIES = path.join(process.env.HOME ?? "", "Movies");

/** Normalize Unicode (macOS uses NFD, Windows uses NFC) */
const norm = (s: string) => s.normalize("NFC");

export interface ResolvedPaths {
  videoName: string;
  ymmpWinPath: string; // Windows側の元パス
  ymmpPath: string; // Mac側にコピー後のパス
  csvPath: string;
  photosDir: string;
  templateOutput: string;
  insertOutput: string;
}

/**
 * Run a PowerShell command inside the Windows VM via prlctl.
 */
async function prlExec(command: string): Promise<string> {
  const proc = Bun.spawn([
    "prlctl", "exec", WIN_VM_NAME, "powershell", "-Command",
    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`,
  ], { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim();
}

/**
 * Search Windows YMM保存 for folders matching the keyword.
 */
async function searchWindowsFolders(keyword: string): Promise<string[]> {
  const output = await prlExec(
    `Get-ChildItem '${WIN_YMM_BASE}' -Directory | Where-Object { $_.Name -like '*${keyword}*' } | Select-Object -ExpandProperty Name`,
  );
  if (!output) return [];
  return output.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * List ymmp files in a Windows YMM保存 subfolder.
 */
async function listWindowsYmmpFiles(folderName: string): Promise<string[]> {
  const folderPath = `${WIN_YMM_BASE}\\${folderName}`;
  const output = await prlExec(
    `Get-ChildItem '${folderPath}' -Filter '*.ymmp' | Select-Object -ExpandProperty Name`,
  );
  if (!output) return [];
  return output.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Copy a file from Windows to Mac via prlctl.
 */
async function copyFromWindows(winPath: string, macDestDir: string): Promise<string> {
  const fileName = winPath.split("\\").pop()!;
  const macPath = path.join(macDestDir, fileName);
  // Use UNC path \\Mac\Home\... to copy from Windows to Mac
  const uncDest = macDestDir.replace(process.env.HOME ?? "", "\\\\Mac\\Home");
  await prlExec(`Copy-Item '${winPath}' '${uncDest}\\' -Force`);
  // Verify the file arrived
  try {
    await fs.access(macPath);
  } catch {
    throw new Error(`ファイルのコピーに失敗しました: ${winPath} → ${macPath}`);
  }
  return macPath;
}

/**
 * Search Mac ~/Downloads for CSV/xlsx matching the keyword.
 */
async function searchMacCsv(keyword: string): Promise<string[]> {
  const files = await fs.readdir(MAC_DOWNLOADS);
  const kw = norm(keyword);
  // Match only canonical files: {動画名}_画像管理シート.csv or .xlsx
  // Exclude duplicates like " - 画像管理シート.csv", "(1).xlsx" etc.
  const pattern = /^(.+)_画像管理シート\.(csv|xlsx)$/i;
  return files
    .filter((f) => {
      const nf = norm(f);
      return nf.includes(kw) && pattern.test(nf);
    })
    .map((f) => path.join(MAC_DOWNLOADS, f));
}

/**
 * Search Mac ~/Movies for folders matching the keyword.
 */
async function searchMacMoviesFolders(keyword: string): Promise<string[]> {
  const entries = await fs.readdir(MAC_MOVIES, { withFileTypes: true });
  const kw = norm(keyword);
  return entries
    .filter((e) => e.isDirectory() && norm(e.name).includes(kw))
    .map((e) => norm(e.name));
}

/**
 * Resolve all paths from a keyword (partial video name match).
 * Returns candidates for user confirmation.
 */
export async function resolve(keyword: string): Promise<{
  folders: string[];
  ymmpFiles: Map<string, string[]>;
  csvFiles: string[];
  moviesFolders: string[];
}> {
  // Search in parallel
  const [folders, csvFiles, moviesFolders] = await Promise.all([
    searchWindowsFolders(keyword),
    searchMacCsv(keyword),
    searchMacMoviesFolders(keyword),
  ]);

  // For each matching folder, list ymmp files
  const ymmpFiles = new Map<string, string[]>();
  for (const folder of folders) {
    const files = await listWindowsYmmpFiles(folder);
    ymmpFiles.set(folder, files);
  }

  return { folders, ymmpFiles, csvFiles, moviesFolders };
}

/**
 * Extract video name from a CSV/xlsx filename.
 */
export function extractVideoNameFromCsv(filePath: string): string {
  const base = norm(path.basename(filePath));
  const match = base.match(/^(.+?)_画像管理シート/);
  return match ? match[1] : base;
}

/**
 * Build resolved paths from user's selection.
 */
export function buildPaths(
  videoName: string,
  ymmpFileName: string,
): Omit<ResolvedPaths, "ymmpPath" | "csvPath"> {
  const ymmpWinPath = `${WIN_YMM_BASE}\\${videoName}\\${ymmpFileName}`;
  const photosDir = path.join(MAC_MOVIES, videoName);
  const templateOutput = path.join(MAC_MOVIES, videoName, `${videoName}-templete.ymmp`);
  const insertOutput = path.join(MAC_MOVIES, videoName, `${videoName}-image.ymmp`);

  return { videoName, ymmpWinPath, photosDir, templateOutput, insertOutput };
}

/**
 * Copy ymmp file from Windows to Mac Downloads.
 */
export async function copyYmmpToMac(winPath: string): Promise<string> {
  console.log(`ymmpファイルをコピー中: ${winPath} → ${MAC_DOWNLOADS}/`);
  return copyFromWindows(winPath, MAC_DOWNLOADS);
}
