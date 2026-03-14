import { describe, expect, test } from "bun:test";
import {
  buildTitleCardItems,
  buildContentSectionItems,
  selectBgm,
  titleCardFontSize,
  sectionTitleFontSize,
  autoWrap,
} from "../src/template-builder.ts";
import {
  TEMPLATE_ASSETS,
  TMPL_LAYER,
  TITLE_CARD_LENGTH,
  BGM_VOLUME,
  SE_VOLUME,
  SE_LENGTH,
} from "../src/constants.ts";

// Helper to extract animated value
function av(item: any, prop: string): number {
  return item[prop]?.Values?.[0]?.Value ?? item[prop];
}

describe("titleCardFontSize", () => {
  test("常に150pt固定", () => {
    expect(titleCardFontSize("短い")).toBe(150);
    expect(titleCardFontSize("1234567890123456")).toBe(150);
    expect(titleCardFontSize("とても長いタイトルカードのテキスト例")).toBe(150);
  });
});

describe("sectionTitleFontSize", () => {
  test("短いテキスト (≤5) → 89.9pt", () => {
    expect(sectionTitleFontSize("はじめに")).toBe(89.9);
    expect(sectionTitleFontSize("12345")).toBe(89.9);
  });

  test("中テキスト (5~8) → 動的に縮小", () => {
    // 6文字: 89.9 - (89.9-64) * 1/3 ≈ 81.3
    expect(sectionTitleFontSize("123456")).toBeCloseTo(89.9 - (89.9 - 64) * 1 / 3, 1);
    // 8文字: 64
    expect(sectionTitleFontSize("12345678")).toBeCloseTo(64, 1);
  });

  test("長いテキスト (>8) → 61.8pt", () => {
    expect(sectionTitleFontSize("123456789")).toBe(61.8);
  });
});

describe("autoWrap", () => {
  test("短いテキストはそのまま", () => {
    expect(autoWrap("あいうえお", 10)).toBe("あいうえお");
  });

  test("超過時は中間付近で改行", () => {
    const result = autoWrap("12345678901", 10);
    expect(result).toContain("\r\n");
    const lines = result.split("\r\n");
    expect(lines.length).toBe(2);
    // Both lines should be roughly equal length
    expect(Math.abs(lines[0]!.length - lines[1]!.length)).toBeLessThanOrEqual(1);
  });

  test("ちょうどの長さはそのまま", () => {
    expect(autoWrap("1234567890", 10)).toBe("1234567890");
  });

  test("CSV改行が入っていればそのまま保持 (\\n → \\r\\n)", () => {
    expect(autoWrap("イオンモール\n香椎浜", 10)).toBe("イオンモール\r\n香椎浜");
  });

  test("CSV改行 \\r\\n もそのまま保持", () => {
    expect(autoWrap("イオンモール\r\n香椎浜", 10)).toBe("イオンモール\r\n香椎浜");
  });
});

describe("buildTitleCardItems", () => {
  const items = buildTitleCardItems(3043, "【第8位】イオンモール香椎浜");

  test("5つのアイテムを生成", () => {
    expect(items.length).toBe(5);
  });

  test("正しいレイヤーに配置", () => {
    const layers = items.map((i) => i.Layer).sort((a, b) => a - b);
    expect(layers).toEqual([
      TMPL_LAYER.titleCard.BG,
      TMPL_LAYER.titleCard.REIMU,
      TMPL_LAYER.titleCard.MARISA,
      TMPL_LAYER.titleCard.TEXT,
      TMPL_LAYER.titleCard.SE,
    ]);
  });

  test("全アイテムが正しいフレーム位置", () => {
    for (const item of items) {
      expect(item.Frame).toBe(3043);
    }
  });

  test("視覚アイテムは90fの長さ", () => {
    const visualItems = items.filter(
      (i) => !i.$type?.includes("AudioItem"),
    );
    for (const item of visualItems) {
      expect(item.Length).toBe(TITLE_CARD_LENGTH);
    }
  });

  test("SE は正しい長さと音量", () => {
    const se = items.find((i) => i.$type?.includes("AudioItem"))!;
    expect(se.Length).toBe(SE_LENGTH);
    expect(av(se, "Volume")).toBe(SE_VOLUME);
  });

  test("背景は黒板背景", () => {
    const bg = items.find((i) => i.Layer === TMPL_LAYER.titleCard.BG)!;
    expect(bg.FilePath).toBe(TEMPLATE_ASSETS.titleBackground);
  });

  test("テキストは白色 + アウトラインあり", () => {
    const text = items.find((i) => i.Layer === TMPL_LAYER.titleCard.TEXT)!;
    expect(text.FontColor).toBe("#FFFFFFFF");
    expect((text.VideoEffects as any[]).length).toBeGreaterThan(0);
    expect(text.BasePoint).toBe("CenterCenter");
  });

  test("TextItem の DisplayInterval/HideInterval はプレーン数値", () => {
    const text = items.find((i) => i.Layer === TMPL_LAYER.titleCard.TEXT)!;
    expect(typeof text.DisplayInterval).toBe("number");
    expect(typeof text.HideInterval).toBe("number");
  });

  test("立ち絵はタイトル顔", () => {
    const reimu = items.find((i) => i.Layer === TMPL_LAYER.titleCard.REIMU)!;
    const param = (reimu as any).TachieItemParameter;
    expect(param.Eyebrow).toContain("12.png");
    expect(param.Eye).toContain("26.png");
    expect(param.Mouth).toContain("22.png");
  });
});

describe("buildContentSectionItems", () => {
  const items = buildContentSectionItems(
    0,
    3043,
    "はじめに",
    TEMPLATE_ASSETS.bgmIntro,
  );

  test("7つのアイテムを生成 (タイトルテキストあり)", () => {
    expect(items.length).toBe(7);
  });

  test("タイトルテキストなしは6つ", () => {
    const itemsNoTitle = buildContentSectionItems(
      0,
      3043,
      "",
      TEMPLATE_ASSETS.bgmIntro,
    );
    expect(itemsNoTitle.length).toBe(6);
  });

  test("BGM の正しいパスと音量", () => {
    const bgm = items.find((i) => i.Layer === TMPL_LAYER.BGM)!;
    expect(bgm.FilePath).toBe(TEMPLATE_ASSETS.bgmIntro);
    expect(av(bgm, "Volume")).toBe(BGM_VOLUME);
  });

  test("正しいレイヤーに配置", () => {
    const layers = items.map((i) => i.Layer).sort((a, b) => a - b);
    expect(layers).toContain(TMPL_LAYER.BGM);
    expect(layers).toContain(TMPL_LAYER.content.SERIF_FRAME);
    expect(layers).toContain(TMPL_LAYER.content.BACKGROUND);
    expect(layers).toContain(TMPL_LAYER.content.TACHIE_MARISA);
    expect(layers).toContain(TMPL_LAYER.content.TACHIE_REIMU);
    expect(layers).toContain(TMPL_LAYER.content.SHAPE);
    expect(layers).toContain(TMPL_LAYER.content.SECTION_TITLE);
  });

  test("立ち絵は通常顔", () => {
    const marisa = items.find(
      (i) => i.Layer === TMPL_LAYER.content.TACHIE_MARISA,
    )!;
    const param = (marisa as any).TachieItemParameter;
    expect(param.Eyebrow).toContain("00.png");
    expect(param.Eye).toContain("00.png");
    expect(param.Mouth).toContain("00.png");
  });

  test("セクションタイトルは黒色 + アウトラインなし", () => {
    const title = items.find(
      (i) => i.Layer === TMPL_LAYER.content.SECTION_TITLE,
    )!;
    expect(title.FontColor).toBe("#FF000000");
    expect((title.VideoEffects as any[]).length).toBe(0);
    expect(title.BasePoint).toBe("CenterCenter");
  });

  test("TextItem の DisplayInterval/HideInterval はプレーン数値", () => {
    const title = items.find(
      (i) => i.Layer === TMPL_LAYER.content.SECTION_TITLE,
    )!;
    expect(typeof title.DisplayInterval).toBe("number");
    expect(typeof title.HideInterval).toBe("number");
  });
});

describe("selectBgm", () => {
  test("最初のセクション → intro", () => {
    expect(selectBgm(0, 11)).toBe(TEMPLATE_ASSETS.bgmIntro);
  });

  test("最後のセクション → outro", () => {
    expect(selectBgm(10, 11)).toBe(TEMPLATE_ASSETS.bgmOutro);
  });

  test("中間セクション → main", () => {
    expect(selectBgm(5, 11)).toBe(TEMPLATE_ASSETS.bgmMain);
  });

  test("3セクションの場合", () => {
    expect(selectBgm(0, 3)).toBe(TEMPLATE_ASSETS.bgmIntro);
    expect(selectBgm(1, 3)).toBe(TEMPLATE_ASSETS.bgmMain);
    expect(selectBgm(2, 3)).toBe(TEMPLATE_ASSETS.bgmOutro);
  });
});
