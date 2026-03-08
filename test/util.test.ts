import { describe, expect, test } from "bun:test";
import { normalizeSerif, toWindowsUncPath, calcZoom, makeRemark } from "../src/util.ts";

describe("normalizeSerif", () => {
  test("removes literal \\n", () => {
    expect(normalizeSerif("突然だけど霊夢、\\n福岡で一番")).toBe(
      "突然だけど霊夢、福岡で一番",
    );
  });

  test("removes actual newlines", () => {
    expect(normalizeSerif("突然だけど霊夢、\n福岡で一番")).toBe(
      "突然だけど霊夢、福岡で一番",
    );
  });

  test("removes whitespace", () => {
    expect(normalizeSerif("hello   world")).toBe("helloworld");
  });

  test("NFKC normalizes fullwidth chars", () => {
    // ＡＢＣ → ABC
    expect(normalizeSerif("ＡＢＣ")).toBe("ABC");
  });

  test("handles combination of all normalizations", () => {
    expect(normalizeSerif("突然だけど\n 霊夢 ")).toBe("突然だけど霊夢");
  });
});

describe("toWindowsUncPath", () => {
  test("converts Mac home path to UNC", () => {
    const home = require("os").homedir();
    const input = `${home}/Downloads/images/test.jpg`;
    const result = toWindowsUncPath(input);
    expect(result).toBe("\\\\Mac\\Home\\Downloads\\images\\test.jpg");
  });

  test("replaces forward slashes with backslashes", () => {
    const home = require("os").homedir();
    const input = `${home}/a/b/c.jpg`;
    expect(toWindowsUncPath(input)).toBe("\\\\Mac\\Home\\a\\b\\c.jpg");
  });

  test("throws for paths outside home directory", () => {
    expect(() => toWindowsUncPath("/tmp/test.jpg")).toThrow(
      "ホームディレクトリ配下ではありません",
    );
  });
});

describe("calcZoom", () => {
  test("fits width-constrained image", () => {
    // Image 1920x1080, clip 960x540 → zoom = 50
    expect(calcZoom(1920, 1080, 960, 540)).toBe(50);
  });

  test("fits height-constrained image", () => {
    // Image 800x800, clip 960x540 → zoom = min(960/800, 540/800) * 100 = 67.5
    expect(calcZoom(800, 800, 960, 540)).toBe(67.5);
  });

  test("image smaller than clip area", () => {
    // Image 480x270, clip 960x540 → zoom = 200
    expect(calcZoom(480, 270, 960, 540)).toBe(200);
  });

  test("exact fit", () => {
    expect(calcZoom(960, 540, 960, 540)).toBe(100);
  });
});

describe("makeRemark", () => {
  test("creates remark with prefix", () => {
    expect(makeRemark("img_001")).toBe("ymm-auto:img_001");
  });
});
