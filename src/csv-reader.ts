import path from "node:path";
import type { ImageEntry, ImageGroup } from "./types.ts";

const REQUIRED_HEADERS = [
  "キャラ",
  "セリフ",
  "画像ID",
  "必要な画像",
  "画像種別",
  "参考文献URL",
  "AI用プロンプト",
];

/**
 * Parse CSV content handling quoted fields with commas and newlines
 */
function parseCsvContent(content: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current);
        current = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && content[i + 1] === "\n") i++; // skip \n in \r\n
        row.push(current);
        current = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
      } else {
        current += ch;
      }
    }
  }
  // Last field/row
  row.push(current);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  return rows;
}

/**
 * Read CSV file
 */
async function readCsv(filePath: string): Promise<string[][]> {
  let content = await Bun.file(filePath).text();
  // Remove BOM
  content = content.replace(/^\uFEFF/, "");
  return parseCsvContent(content);
}

/**
 * Read xlsx file (first sheet)
 */
async function readXlsx(filePath: string): Promise<string[][]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("xlsxファイルにシートがありません");

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Pad with empty strings for gaps
      while (values.length < colNumber - 1) values.push("");
      const cellValue = cell.value;
      values.push(cellValue == null ? "" : String(cellValue));
    });
    rows.push(values);
  });
  return rows;
}

/**
 * Validate headers match expected columns
 */
function validateHeaders(headers: string[]): void {
  const trimmed = headers.map((h) => h.trim());
  for (const required of REQUIRED_HEADERS) {
    if (!trimmed.includes(required)) {
      throw new Error(
        `必須列「${required}」が見つかりません。ヘッダー: [${trimmed.join(", ")}]`,
      );
    }
  }
}

/**
 * Read image entries from CSV or xlsx file, grouped by imageId
 */
export async function readImageSheet(
  filePath: string,
): Promise<ImageGroup[]> {
  const ext = path.extname(filePath).toLowerCase();
  let rows: string[][];

  if (ext === ".xlsx") {
    rows = await readXlsx(filePath);
  } else if (ext === ".csv") {
    rows = await readCsv(filePath);
  } else {
    throw new Error(`未対応のファイル形式: ${ext}（.csv または .xlsx のみ）`);
  }

  if (rows.length < 2) {
    throw new Error("データ行がありません");
  }

  const headers = rows[0]!;
  validateHeaders(headers);

  const trimmedHeaders = headers.map((h) => h.trim());
  const colIndex = (name: string) => trimmedHeaders.indexOf(name);

  const entries: ImageEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const character = row[colIndex("キャラ")]?.trim() ?? "";
    const serif = row[colIndex("セリフ")]?.trim() ?? "";
    const imageId = row[colIndex("画像ID")]?.trim() ?? "";
    const description = row[colIndex("必要な画像")]?.trim() ?? "";
    const imageType = row[colIndex("画像種別")]?.trim() ?? "";
    const referenceUrl = row[colIndex("参考文献URL")]?.trim() ?? "";
    const aiPrompt = row[colIndex("AI用プロンプト")]?.trim() ?? "";

    if (!character || !serif) continue; // skip empty rows

    if (imageType !== "AI" && imageType !== "実写" && imageType !== "図解") {
      if (imageId) {
        console.warn(
          `警告: 行${i + 1} の画像種別「${imageType}」は未対応（AI/実写/図解のみ）。スキップします。`,
        );
      }
      continue;
    }

    const titleCardIdx = colIndex("タイトルカード");
    const sectionTitleIdx = colIndex("セクションタイトル");
    const titleCard = titleCardIdx >= 0 ? row[titleCardIdx]?.trim() ?? "" : "";
    const sectionTitle = sectionTitleIdx >= 0 ? row[sectionTitleIdx]?.trim() ?? "" : "";

    entries.push({
      character,
      serif,
      imageId,
      description,
      imageType,
      referenceUrl,
      aiPrompt,
      ...(titleCard && { titleCard }),
      ...(sectionTitle && { sectionTitle }),
    });
  }

  // Group by imageId
  const groupMap = new Map<string, ImageGroup>();
  for (const entry of entries) {
    if (!entry.imageId) continue;
    const existing = groupMap.get(entry.imageId);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groupMap.set(entry.imageId, {
        imageId: entry.imageId,
        description: entry.description,
        imageType: entry.imageType,
        referenceUrl: entry.referenceUrl,
        aiPrompt: entry.aiPrompt,
        entries: [entry],
      });
    }
  }

  return Array.from(groupMap.values());
}

const SECTION_REQUIRED_HEADERS = ["キャラ", "セリフ"];

/**
 * Read CSV/xlsx for template command (section info only).
 * Requires at minimum: キャラ, セリフ columns.
 * Optionally reads: タイトルカード, セクションタイトル columns.
 * Returns all rows as ImageEntry[] (no grouping).
 */
export async function readSectionSheet(
  filePath: string,
): Promise<ImageEntry[]> {
  const ext = path.extname(filePath).toLowerCase();
  let rows: string[][];

  if (ext === ".xlsx") {
    rows = await readXlsx(filePath);
  } else if (ext === ".csv") {
    rows = await readCsv(filePath);
  } else {
    throw new Error(`未対応のファイル形式: ${ext}（.csv または .xlsx のみ）`);
  }

  if (rows.length < 2) {
    throw new Error("データ行がありません");
  }

  const headers = rows[0]!;
  const trimmedHeaders = headers.map((h) => h.trim());

  // Validate minimal required headers
  for (const required of SECTION_REQUIRED_HEADERS) {
    if (!trimmedHeaders.includes(required)) {
      throw new Error(
        `必須列「${required}」が見つかりません。ヘッダー: [${trimmedHeaders.join(", ")}]`,
      );
    }
  }

  const colIndex = (name: string) => trimmedHeaders.indexOf(name);

  const entries: ImageEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const character = row[colIndex("キャラ")]?.trim() ?? "";
    const serif = row[colIndex("セリフ")]?.trim() ?? "";

    if (!character || !serif) continue; // skip empty rows

    // Optional columns (may not exist in minimal CSV)
    const imageId = colIndex("画像ID") >= 0 ? row[colIndex("画像ID")]?.trim() ?? "" : "";
    const description = colIndex("必要な画像") >= 0 ? row[colIndex("必要な画像")]?.trim() ?? "" : "";
    const imageTypeRaw = colIndex("画像種別") >= 0 ? row[colIndex("画像種別")]?.trim() ?? "" : "";
    const referenceUrl = colIndex("参考文献URL") >= 0 ? row[colIndex("参考文献URL")]?.trim() ?? "" : "";
    const aiPrompt = colIndex("AI用プロンプト") >= 0 ? row[colIndex("AI用プロンプト")]?.trim() ?? "" : "";
    const titleCard = colIndex("タイトルカード") >= 0 ? row[colIndex("タイトルカード")]?.trim() ?? "" : "";
    const sectionTitle = colIndex("セクションタイトル") >= 0 ? row[colIndex("セクションタイトル")]?.trim() ?? "" : "";

    const imageType = (imageTypeRaw === "AI" || imageTypeRaw === "実写" || imageTypeRaw === "図解")
      ? imageTypeRaw
      : "AI"; // default for template command (not used)

    entries.push({
      character,
      serif,
      imageId,
      description,
      imageType,
      referenceUrl,
      aiPrompt,
      ...(titleCard && { titleCard }),
      ...(sectionTitle && { sectionTitle }),
    });
  }

  return entries;
}
