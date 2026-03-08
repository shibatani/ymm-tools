import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  readYmmp,
  getItems,
  findVoiceItems,
  findShapeTemplate,
  detectChapters,
  buildShapeItem,
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

describe("buildShapeItem", () => {
  test("clones template with new frame/length/layer", async () => {
    const data = await readYmmp(FIXTURE_PATH);
    const items = getItems(data);
    const template = findShapeTemplate(items)!;
    const built = buildShapeItem(template, 5000, 2000);
    expect(built.Frame).toBe(5000);
    expect(built.Length).toBe(2000);
    expect(built.Layer).toBe(10);
    expect(built.Remark).toBe("ymm-auto:clipping:5000");
    // Original template unchanged
    expect(template.Layer).toBe(6);
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
  test("builds TextItem for reference URL", () => {
    const built = buildTextItem({
      text: "https://example.com",
      frame: 100,
      length: 200,
      imageId: "img_001",
    });
    expect(built.$type).toContain("TextItem");
    expect(built.Layer).toBe(12);
    expect(built.Font).toBe("けいふぉんと");
    expect(built.FontSize).toBe(24.1);
    expect(built.IsLocked).toBe(true);
    expect(built.Remark).toBe("ymm-auto:img_001:ref");
  });

  test("calculates X coordinate from image position", () => {
    const built = buildTextItem({
      text: "https://example.com",
      frame: 100,
      length: 200,
      imageId: "img_001",
      imageX: 705,
      imageWidth: 1920,
      zoom: 50,
    });
    // X = 705 - (1920 * 50 / 100 / 2) = 705 - 480 = 225
    expect((built.X as { Values: Array<{ Value: number }> }).Values[0]!.Value).toBe(225);
  });

  test("defaults X to 0 when image params not provided", () => {
    const built = buildTextItem({
      text: "https://example.com",
      frame: 100,
      length: 200,
      imageId: "img_001",
    });
    expect((built.X as { Values: Array<{ Value: number }> }).Values[0]!.Value).toBe(0);
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
