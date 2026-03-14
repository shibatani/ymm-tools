import { describe, expect, test } from "bun:test";
import { extractSections, matchSections } from "../src/section.ts";
import type { ImageEntry, VoiceEntry } from "../src/types.ts";

function makeEntry(overrides: Partial<ImageEntry> = {}): ImageEntry {
  return {
    character: "ゆっくり魔理沙",
    serif: "テストセリフ",
    imageId: "",
    description: "",
    imageType: "AI",
    referenceUrl: "",
    aiPrompt: "",
    ...overrides,
  };
}

function makeVoiceEntry(overrides: Partial<VoiceEntry> = {}): VoiceEntry {
  return {
    characterName: "ゆっくり魔理沙",
    serif: "テストセリフ",
    frame: 0,
    length: 100,
    ...overrides,
  };
}

describe("extractSections", () => {
  test("セクション先頭行を正しく抽出", () => {
    const entries = [
      makeEntry({ serif: "セリフ1", sectionTitle: "はじめに" }),
      makeEntry({ serif: "セリフ2" }),
      makeEntry({ serif: "セリフ3", titleCard: "【第8位】", sectionTitle: "香椎浜" }),
      makeEntry({ serif: "セリフ4" }),
      makeEntry({ serif: "セリフ5", titleCard: "【第7位】", sectionTitle: "福岡伊都" }),
      makeEntry({ serif: "セリフ6", titleCard: "まとめ", sectionTitle: "まとめ" }),
    ];

    const sections = extractSections(entries);
    expect(sections.length).toBe(4);
    expect(sections[0]!.sectionTitle).toBe("はじめに");
    expect(sections[0]!.titleCard).toBe("");
    expect(sections[1]!.titleCard).toBe("【第8位】");
    expect(sections[1]!.sectionTitle).toBe("香椎浜");
  });

  test("セクション0行でエラー", () => {
    const entries = [
      makeEntry({ serif: "セリフ1" }),
      makeEntry({ serif: "セリフ2" }),
    ];

    expect(() => extractSections(entries)).toThrow(
      "セクション定義が見つかりません",
    );
  });

  test("セクション数 < 3 でエラー", () => {
    const entries = [
      makeEntry({ serif: "セリフ1", sectionTitle: "はじめに" }),
      makeEntry({ serif: "セリフ2", sectionTitle: "おわりに" }),
    ];

    expect(() => extractSections(entries)).toThrow(
      "セクション数が2件です",
    );
  });

  test("セリフ空のセクション先頭行でエラー", () => {
    const entries = [
      makeEntry({ serif: "", sectionTitle: "はじめに" }),
      makeEntry({ serif: "セリフ2", sectionTitle: "中盤" }),
      makeEntry({ serif: "セリフ3", sectionTitle: "おわり" }),
    ];

    expect(() => extractSections(entries)).toThrow(
      "セクション先頭行（行2）のセリフが空です",
    );
  });

  test("重複キャラ+セリフで警告 (エラーにはならない)", () => {
    const entries = [
      makeEntry({ serif: "同じセリフ", sectionTitle: "セクション1" }),
      makeEntry({ serif: "別のセリフ", sectionTitle: "セクション2" }),
      makeEntry({ serif: "同じセリフ", sectionTitle: "セクション3" }),
      makeEntry({ serif: "最後のセリフ", sectionTitle: "セクション4" }),
    ];

    // Should not throw, just warn
    const sections = extractSections(entries);
    expect(sections.length).toBe(4);
  });
});

describe("matchSections", () => {
  test("正しいフレーム位置を返す", () => {
    const sectionDefs = [
      { titleCard: "", sectionTitle: "はじめに", character: "ゆっくり魔理沙", serif: "セリフ1" },
      { titleCard: "【第8位】", sectionTitle: "香椎浜", character: "ゆっくり魔理沙", serif: "セリフ3" },
      { titleCard: "まとめ", sectionTitle: "まとめ", character: "ゆっくり魔理沙", serif: "セリフ5" },
    ];

    const voiceItems = [
      makeVoiceEntry({ serif: "セリフ1", frame: 0, length: 100 }),
      makeVoiceEntry({ serif: "セリフ2", frame: 100, length: 100 }),
      makeVoiceEntry({ serif: "セリフ3", frame: 200, length: 100 }),
      makeVoiceEntry({ serif: "セリフ4", frame: 300, length: 100 }),
      makeVoiceEntry({ serif: "セリフ5", frame: 400, length: 100 }),
    ];

    const sections = matchSections(sectionDefs, voiceItems);
    expect(sections.length).toBe(3);
    expect(sections[0]!.frame).toBe(0);
    expect(sections[0]!.length).toBe(200); // until セリフ3
    expect(sections[1]!.frame).toBe(200);
    expect(sections[1]!.length).toBe(200); // until セリフ5
    expect(sections[2]!.frame).toBe(400);
    expect(sections[2]!.length).toBe(100); // until end (frame 400 + length 100 = 500 - 400)
  });

  test("VoiceItem 0件でエラー", () => {
    const sectionDefs = [
      { titleCard: "", sectionTitle: "はじめに", character: "ゆっくり魔理沙", serif: "セリフ1" },
      { titleCard: "中盤", sectionTitle: "中盤", character: "ゆっくり魔理沙", serif: "セリフ2" },
      { titleCard: "まとめ", sectionTitle: "まとめ", character: "ゆっくり魔理沙", serif: "セリフ3" },
    ];

    expect(() => matchSections(sectionDefs, [])).toThrow(
      "VoiceItem が見つかりません",
    );
  });

  test("マッチしないセクションはスキップ", () => {
    const sectionDefs = [
      { titleCard: "", sectionTitle: "はじめに", character: "ゆっくり魔理沙", serif: "セリフ1" },
      { titleCard: "中盤", sectionTitle: "中盤", character: "ゆっくり魔理沙", serif: "存在しない" },
      { titleCard: "中盤2", sectionTitle: "中盤2", character: "ゆっくり魔理沙", serif: "セリフ3" },
      { titleCard: "まとめ", sectionTitle: "まとめ", character: "ゆっくり魔理沙", serif: "セリフ5" },
    ];

    const voiceItems = [
      makeVoiceEntry({ serif: "セリフ1", frame: 0, length: 100 }),
      makeVoiceEntry({ serif: "セリフ3", frame: 200, length: 100 }),
      makeVoiceEntry({ serif: "セリフ5", frame: 400, length: 100 }),
    ];

    const sections = matchSections(sectionDefs, voiceItems);
    expect(sections.length).toBe(3); // 1 skipped, 3 matched
  });

  test("マッチ成功が3未満でエラー", () => {
    const sectionDefs = [
      { titleCard: "", sectionTitle: "はじめに", character: "ゆっくり魔理沙", serif: "存在しない1" },
      { titleCard: "中盤", sectionTitle: "中盤", character: "ゆっくり魔理沙", serif: "存在しない2" },
      { titleCard: "まとめ", sectionTitle: "まとめ", character: "ゆっくり魔理沙", serif: "セリフ1" },
    ];

    const voiceItems = [
      makeVoiceEntry({ serif: "セリフ1", frame: 0, length: 100 }),
    ];

    expect(() => matchSections(sectionDefs, voiceItems)).toThrow(
      "マッチ成功セクション数が1件です",
    );
  });

  test("フレーム昇順でソートされる", () => {
    const sectionDefs = [
      { titleCard: "まとめ", sectionTitle: "まとめ", character: "ゆっくり魔理沙", serif: "セリフ5" },
      { titleCard: "", sectionTitle: "はじめに", character: "ゆっくり魔理沙", serif: "セリフ1" },
      { titleCard: "中盤", sectionTitle: "中盤", character: "ゆっくり魔理沙", serif: "セリフ3" },
    ];

    const voiceItems = [
      makeVoiceEntry({ serif: "セリフ1", frame: 0, length: 100 }),
      makeVoiceEntry({ serif: "セリフ3", frame: 200, length: 100 }),
      makeVoiceEntry({ serif: "セリフ5", frame: 400, length: 100 }),
    ];

    const sections = matchSections(sectionDefs, voiceItems);
    expect(sections[0]!.frame).toBe(0);
    expect(sections[1]!.frame).toBe(200);
    expect(sections[2]!.frame).toBe(400);
  });
});
