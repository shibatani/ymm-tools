import { describe, it, expect } from "bun:test";
import { applyExpressions } from "../src/expression.ts";
import { EXPRESSION_MAP } from "../src/constants.ts";
import type { ImageEntry, VoiceEntry, YmmpItem } from "../src/types.ts";

function makeVoiceItem(characterName: string, serif: string, frame: number): YmmpItem {
  return {
    $type: "YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker",
    CharacterName: characterName,
    Serif: serif,
    Frame: frame,
    Length: 100,
    Layer: 1,
    TachieFaceParameter: {
      $type: "YukkuriMovieMaker.Plugin.Tachie.AnimationTachie.FaceParameter, YukkuriMovieMaker.Plugin.Tachie.AnimationTachie",
      Eyebrow: `C:\\動画作成\\立ち絵\\まりさ\\眉\\00.png`,
      Eye: `C:\\動画作成\\立ち絵\\まりさ\\目\\00.png`,
      Mouth: `C:\\動画作成\\立ち絵\\まりさ\\口\\00.png`,
      Hair: `C:\\動画作成\\立ち絵\\まりさ\\髪\\00.png`,
      Body: null,
    },
  } as YmmpItem;
}

function makeReimuVoiceItem(serif: string, frame: number): YmmpItem {
  return {
    $type: "YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker",
    CharacterName: "ゆっくり霊夢",
    Serif: serif,
    Frame: frame,
    Length: 100,
    Layer: 2,
    TachieFaceParameter: {
      $type: "YukkuriMovieMaker.Plugin.Tachie.AnimationTachie.FaceParameter, YukkuriMovieMaker.Plugin.Tachie.AnimationTachie",
      Eyebrow: `C:\\動画作成\\立ち絵\\れいむ\\眉\\00.png`,
      Eye: `C:\\動画作成\\立ち絵\\れいむ\\目\\00.png`,
      Mouth: `C:\\動画作成\\立ち絵\\れいむ\\口\\00.png`,
      Hair: `C:\\動画作成\\立ち絵\\れいむ\\髪\\00.png`,
      Body: `C:\\動画作成\\立ち絵\\れいむ\\体\\00.png`,
    },
  } as YmmpItem;
}

function makeEntry(character: string, serif: string, expression?: string): ImageEntry {
  return {
    character,
    serif,
    imageId: "",
    description: "",
    imageType: "AI",
    referenceUrl: "",
    aiPrompt: "",
    ...(expression && { expression }),
  };
}

function makeVoiceEntry(characterName: string, serif: string, frame: number): VoiceEntry {
  return { characterName, serif, frame, length: 100 };
}

// --- Expression mapping tests ---

describe("EXPRESSION_MAP", () => {
  it("should have all 6 non-default expressions", () => {
    expect(Object.keys(EXPRESSION_MAP)).toEqual([
      "焦り", "にやり", "驚き", "悲しみ", "泣く", "怒り",
    ]);
  });

  it("焦り should have null eyebrow", () => {
    expect(EXPRESSION_MAP["焦り"]!.eyebrow).toBeNull();
  });

  it("all expressions should have eye and mouth defined", () => {
    for (const [name, def] of Object.entries(EXPRESSION_MAP)) {
      expect(def.eye).toBeTruthy();
      expect(def.mouth).toBeTruthy();
    }
  });
});

// --- Expression application tests ---

describe("applyExpressions", () => {
  it("should apply expression to matching VoiceItem", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "テストセリフ", "にやり"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "テストセリフ", 0),
    ];
    const ymmpItems = [
      makeVoiceItem("ゆっくり魔理沙", "テストセリフ", 0),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);

    expect(result.applied.length).toBe(1);
    expect(result.applied[0]!.expression).toBe("にやり");

    const face = ymmpItems[0]!.TachieFaceParameter as Record<string, unknown>;
    expect(face.Eye).toBe("C:\\動画作成\\立ち絵\\まりさ\\目\\01.png");
    expect(face.Mouth).toBe("C:\\動画作成\\立ち絵\\まりさ\\口\\06.png");
    expect(face.Eyebrow).toBe("C:\\動画作成\\立ち絵\\まりさ\\眉\\00.png");
    // Hair should be untouched
    expect(face.Hair).toBe("C:\\動画作成\\立ち絵\\まりさ\\髪\\00.png");
  });

  it("should set eyebrow to null for 焦り", () => {
    const entries = [
      makeEntry("ゆっくり霊夢", "びっくり", "焦り"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり霊夢", "びっくり", 100),
    ];
    const ymmpItems = [
      makeReimuVoiceItem("びっくり", 100),
    ];

    applyExpressions(entries, voiceEntries, ymmpItems, false);

    const face = ymmpItems[0]!.TachieFaceParameter as Record<string, unknown>;
    expect(face.Eyebrow).toBeNull();
    expect(face.Eye).toBe("C:\\動画作成\\立ち絵\\れいむ\\目\\06.png");
    expect(face.Mouth).toBe("C:\\動画作成\\立ち絵\\れいむ\\口\\13.png");
    // Body should be untouched
    expect(face.Body).toBe("C:\\動画作成\\立ち絵\\れいむ\\体\\00.png");
  });

  it("should not modify VoiceItem when expression is empty", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "普通のセリフ"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "普通のセリフ", 0),
    ];
    const ymmpItems = [
      makeVoiceItem("ゆっくり魔理沙", "普通のセリフ", 0),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);

    expect(result.applied.length).toBe(0);
    expect(result.skipped).toBe(1);

    const face = ymmpItems[0]!.TachieFaceParameter as Record<string, unknown>;
    expect(face.Eye).toBe("C:\\動画作成\\立ち絵\\まりさ\\目\\00.png");
  });

  it("should not modify anything when no entries have expressions", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "セリフ1"),
      makeEntry("ゆっくり霊夢", "セリフ2"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "セリフ1", 0),
      makeVoiceEntry("ゆっくり霊夢", "セリフ2", 100),
    ];
    const ymmpItems = [
      makeVoiceItem("ゆっくり魔理沙", "セリフ1", 0),
      makeReimuVoiceItem("セリフ2", 100),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);

    expect(result.applied.length).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("should report unknown expression names", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "セリフ", "ドヤ顔"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "セリフ", 0),
    ];
    const ymmpItems = [
      makeVoiceItem("ゆっくり魔理沙", "セリフ", 0),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);

    expect(result.unknownExpressions).toEqual(["ドヤ顔"]);
    expect(result.applied.length).toBe(0);
  });

  it("should not modify ymmp items in dry-run mode", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "テスト", "驚き"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "テスト", 0),
    ];
    const ymmpItems = [
      makeVoiceItem("ゆっくり魔理沙", "テスト", 0),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, true);

    expect(result.applied.length).toBe(1);
    // ymmp should NOT be modified
    const face = ymmpItems[0]!.TachieFaceParameter as Record<string, unknown>;
    expect(face.Eye).toBe("C:\\動画作成\\立ち絵\\まりさ\\目\\00.png");
  });

  it("should handle multiple entries with mixed expressions", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "普通", undefined),
      makeEntry("ゆっくり霊夢", "びっくり", "驚き"),
      makeEntry("ゆっくり魔理沙", "にやっ", "にやり"),
      makeEntry("ゆっくり霊夢", "かなしい", "悲しみ"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "普通", 0),
      makeVoiceEntry("ゆっくり霊夢", "びっくり", 100),
      makeVoiceEntry("ゆっくり魔理沙", "にやっ", 200),
      makeVoiceEntry("ゆっくり霊夢", "かなしい", 300),
    ];
    const ymmpItems = [
      makeVoiceItem("ゆっくり魔理沙", "普通", 0),
      makeReimuVoiceItem("びっくり", 100),
      makeVoiceItem("ゆっくり魔理沙", "にやっ", 200),
      makeReimuVoiceItem("かなしい", 300),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);

    expect(result.applied.length).toBe(3);
    expect(result.skipped).toBe(1);

    // First item should be unchanged
    const face0 = ymmpItems[0]!.TachieFaceParameter as Record<string, unknown>;
    expect(face0.Eye).toBe("C:\\動画作成\\立ち絵\\まりさ\\目\\00.png");

    // Second item should have 驚き
    const face1 = ymmpItems[1]!.TachieFaceParameter as Record<string, unknown>;
    expect(face1.Eye).toBe("C:\\動画作成\\立ち絵\\れいむ\\目\\05.png");
    expect(face1.Mouth).toBe("C:\\動画作成\\立ち絵\\れいむ\\口\\11.png");

    // Third item should have にやり
    const face2 = ymmpItems[2]!.TachieFaceParameter as Record<string, unknown>;
    expect(face2.Eye).toBe("C:\\動画作成\\立ち絵\\まりさ\\目\\01.png");

    // Fourth item should have 悲しみ
    const face3 = ymmpItems[3]!.TachieFaceParameter as Record<string, unknown>;
    expect(face3.Eyebrow).toBe("C:\\動画作成\\立ち絵\\れいむ\\眉\\03.png");
    expect(face3.Eye).toBe("C:\\動画作成\\立ち絵\\れいむ\\目\\02.png");
    expect(face3.Mouth).toBe("C:\\動画作成\\立ち絵\\れいむ\\口\\01.png");
  });

  it("should handle same serif with different expressions in order", () => {
    const entries = [
      makeEntry("ゆっくり霊夢", "えっ", "驚き"),
      makeEntry("ゆっくり霊夢", "えっ", "焦り"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり霊夢", "えっ", 0),
      makeVoiceEntry("ゆっくり霊夢", "えっ", 200),
    ];
    const ymmpItems = [
      makeReimuVoiceItem("えっ", 0),
      makeReimuVoiceItem("えっ", 200),
    ];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);

    expect(result.applied.length).toBe(2);

    // First should be 驚き
    const face0 = ymmpItems[0]!.TachieFaceParameter as Record<string, unknown>;
    expect(face0.Eye).toBe("C:\\動画作成\\立ち絵\\れいむ\\目\\05.png");

    // Second should be 焦り
    const face1 = ymmpItems[1]!.TachieFaceParameter as Record<string, unknown>;
    expect(face1.Eyebrow).toBeNull();
    expect(face1.Eye).toBe("C:\\動画作成\\立ち絵\\れいむ\\目\\06.png");
  });

  it("should skip VoiceItem without TachieFaceParameter", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "テスト", "にやり"),
    ];
    const voiceEntries = [
      makeVoiceEntry("ゆっくり魔理沙", "テスト", 0),
    ];
    const ymmpItems: YmmpItem[] = [{
      $type: "YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker",
      CharacterName: "ゆっくり魔理沙",
      Serif: "テスト",
      Frame: 0,
      Length: 100,
      Layer: 1,
      // No TachieFaceParameter
    } as YmmpItem];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);
    expect(result.applied.length).toBe(1);
    // Should not throw
  });

  it("should report unmatched entries with expressions", () => {
    const entries = [
      makeEntry("ゆっくり魔理沙", "存在しないセリフ", "驚き"),
    ];
    const voiceEntries: VoiceEntry[] = [];
    const ymmpItems: YmmpItem[] = [];

    const result = applyExpressions(entries, voiceEntries, ymmpItems, false);
    expect(result.unmatched.length).toBe(1);
    expect(result.unmatched[0]!.expression).toBe("驚き");
  });
});
