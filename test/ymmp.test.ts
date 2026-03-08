import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  readYmmp,
  getItems,
  findVoiceItems,
  findShapeTemplate,
  detectChapters,
  buildClippingShapeItem,
  buildImageItem,
  buildTextItem,
  hasRemark,
} from "../src/ymmp.ts";

const FIXTURE_PATH = path.join(import.meta.dir, "fixtures/sample.ymmp");

describe("readYmmp + getItems", () => {
  test("reads sample ymmp and extracts items", async () => {
    const data = await readYmmp(FIXTURE_PATH);
    const items = getItems(data);
    expect(items.length).toBeGreaterThan(0);
  });

  test("getItems throws if Timelines is missing", () => {
    expect(() =>
      getItems({ FilePath: "", Timelines: [], Characters: [] }),
    ).toThrow("Timelines[0].Items");
  });
});

describe("findVoiceItems", () => {
  test("extracts VoiceItems from fixture", async () => {
    const data = await readYmmp(FIXTURE_PATH);
    const items = getItems(data);
    const voices = findVoiceItems(items);
    expect(voices).toHaveLength(4);
    expect(voices[0]!.characterName).toBe("ゆっくり魔理沙");
    expect(voices[0]!.frame).toBe(100);
  });
});

describe("findShapeTemplate", () => {
  test("finds Layer 6 ShapeItem", async () => {
    const data = await readYmmp(FIXTURE_PATH);
    const items = getItems(data);
    const template = findShapeTemplate(items);
    expect(template).toBeDefined();
    expect(template!.Layer).toBe(6);
  });
});

describe("detectChapters", () => {
  test("detects chapters from Layer 6 ShapeItems", async () => {
    const data = await readYmmp(FIXTURE_PATH);
    const items = getItems(data);
    const chapters = detectChapters(items);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.frame).toBe(0);
    expect(chapters[0]!.length).toBe(3043);
    expect(chapters[1]!.frame).toBe(3133);
    expect(chapters[1]!.length).toBe(4606);
  });
});

describe("buildClippingShapeItem", () => {
  test("creates hardcoded clipping shape with correct properties", () => {
    const built = buildClippingShapeItem(5000, 2000);
    expect(built.Frame).toBe(5000);
    expect(built.Length).toBe(2000);
    expect(built.Layer).toBe(10);
    expect(built.Remark).toBe("ymm-auto:clipping:5000");
    expect(built.$type).toContain("ShapeItem");
    // Verify blackboard color
    expect((built.ShapeParameter as any).Brush.Parameter.Color).toBe("#FF184233");
  });
});

describe("buildImageItem", () => {
  test("builds ImageItem with template coordinates", async () => {
    const data = await readYmmp(FIXTURE_PATH);
    const items = getItems(data);
    const template = findShapeTemplate(items);
    const built = buildImageItem(template, {
      filePath: "\\\\Mac\\Home\\test.jpg",
      frame: 100,
      length: 200,
      zoom: 75.5,
      imageId: "img_001",
    });
    expect(built.$type).toContain("ImageItem");
    expect(built.Layer).toBe(11);
    expect(built.IsClippingWithObjectAbove).toBe(true);
    expect(built.Remark).toBe("ymm-auto:img_001");
  });

  test("builds ImageItem with default coordinates when template is undefined", () => {
    const built = buildImageItem(undefined, {
      filePath: "\\\\Mac\\Home\\test.jpg",
      frame: 100,
      length: 200,
      zoom: 100,
      imageId: "img_002",
    });
    expect(built.$type).toContain("ImageItem");
    expect(built.Frame).toBe(100);
  });
});

describe("buildTextItem", () => {
  test("builds TextItem matching template style", () => {
    const built = buildTextItem({
      text: "https://example.com",
      frame: 100,
      length: 200,
      imageId: "img_001",
    });
    expect(built.$type).toContain("TextItem");
    expect(built.Layer).toBe(12);
    expect(built.Font).toBe("けいふぉんと");
    expect((built.FontSize as { Values: Array<{ Value: number }> }).Values[0]!.Value).toBe(24.1);
    expect(built.FontColor).toBe("#FFFFFFFF");
    expect(built.BasePoint).toBe("LeftTop");
    expect(built.WordWrap).toBe("NoWrap");
    expect(built.IsLocked).toBe(true);
    expect(built.Remark).toBe("ymm-auto:img_001:ref");
    // Default X = -560 when no image dimensions provided
    expect((built.X as { Values: Array<{ Value: number }> }).Values[0]!.Value).toBe(-560);
    expect((built.Y as { Values: Array<{ Value: number }> }).Values[0]!.Value).toBe(-505);
  });

  test("aligns text left edge to image left edge", () => {
    const built = buildTextItem({
      text: "https://example.com",
      frame: 100,
      length: 200,
      imageId: "img_001",
      imageWidth: 1456,
      zoom: 79.3,
    });
    // X = -2.5 - (1456 * 79.3 / 100 / 2) = -2.5 - 577.3 = -579.8
    const x = (built.X as { Values: Array<{ Value: number }> }).Values[0]!.Value;
    expect(x).toBeCloseTo(-579.8, 0);
    expect(built.BasePoint).toBe("LeftTop");
  });
});

describe("hasRemark", () => {
  test("returns true when remark exists", async () => {
    const items = [
      { $type: "test", Frame: 0, Length: 0, Layer: 0, Remark: "ymm-auto:img_001" },
    ];
    expect(hasRemark(items, "ymm-auto:img_001")).toBe(true);
  });

  test("returns false when remark not found", () => {
    const items = [
      { $type: "test", Frame: 0, Length: 0, Layer: 0, Remark: "" },
    ];
    expect(hasRemark(items, "ymm-auto:img_001")).toBe(false);
  });
});
