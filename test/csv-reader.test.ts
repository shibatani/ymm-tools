import { describe, expect, test } from "bun:test";
import { readImageSheet } from "../src/csv-reader.ts";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const tmpDir = path.join(os.tmpdir(), "ymm-test-csv");

async function writeTempCsv(name: string, content: string): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true });
  const p = path.join(tmpDir, name);
  await Bun.write(p, content);
  return p;
}

describe("readImageSheet", () => {
  test("parses basic CSV", async () => {
    const csv = `キャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト
ゆっくり魔理沙,こんにちは,img_001,テスト画像,AI,,テストプロンプト
ゆっくり霊夢,さようなら,img_002,テスト画像2,実写,https://example.com,`;
    const p = await writeTempCsv("basic.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.imageId).toBe("img_001");
    expect(groups[0]!.imageType).toBe("AI");
    expect(groups[1]!.imageId).toBe("img_002");
    expect(groups[1]!.referenceUrl).toBe("https://example.com");
  });

  test("handles BOM", async () => {
    const csv = `\uFEFFキャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト
魔理沙,テスト,img_001,画像,AI,,prompt`;
    const p = await writeTempCsv("bom.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(1);
  });

  test("handles quoted fields with commas", async () => {
    const csv = `キャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト
魔理沙,"こんにちは,世界",img_001,画像,AI,,prompt`;
    const p = await writeTempCsv("quoted.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries[0]!.serif).toBe("こんにちは,世界");
  });

  test("handles \\r\\n line endings", async () => {
    const csv =
      "キャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト\r\n魔理沙,テスト,img_001,画像,AI,,prompt\r\n";
    const p = await writeTempCsv("crlf.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(1);
  });

  test("handles \\r only line endings", async () => {
    const csv =
      "キャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト\r魔理沙,テスト,img_001,画像,AI,,prompt\r";
    const p = await writeTempCsv("cr.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(1);
  });

  test("groups multiple rows with same imageId", async () => {
    const csv = `キャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト
魔理沙,セリフ1,img_001,画像,AI,,prompt
魔理沙,セリフ2,img_001,画像,AI,,prompt`;
    const p = await writeTempCsv("grouped.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries).toHaveLength(2);
  });

  test("throws on missing required header", async () => {
    const csv = `キャラ,セリフ,画像ID
魔理沙,テスト,img_001`;
    const p = await writeTempCsv("bad-header.csv", csv);
    await expect(readImageSheet(p)).rejects.toThrow("必須列");
  });

  test("throws on unsupported file extension", async () => {
    const p = await writeTempCsv("bad.txt", "data");
    await expect(readImageSheet(p)).rejects.toThrow("未対応のファイル形式");
  });

  test("skips rows with empty character or serif", async () => {
    const csv = `キャラ,セリフ,画像ID,必要な画像,画像種別,参考文献URL,AI用プロンプト
,テスト,img_001,画像,AI,,prompt
魔理沙,,img_002,画像,AI,,prompt
魔理沙,有効,img_003,画像,AI,,prompt`;
    const p = await writeTempCsv("empty-fields.csv", csv);
    const groups = await readImageSheet(p);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.imageId).toBe("img_003");
  });
});
