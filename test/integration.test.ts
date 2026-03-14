import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import { readImageSheet } from "../src/csv-reader.ts";
import {
  readYmmp,
  getItems,
  findVoiceItems,
  detectChapters,
} from "../src/ymmp.ts";
import { matchEntries } from "../src/matcher.ts";
import { step4_insertClipping, step5_insertPhotos, step7_insertAi } from "../src/steps.ts";
import { LAYER_CLIPPING, LAYER_IMAGE, LAYER_REFERENCE_TEXT } from "../src/constants.ts";
import type { ImageBlock, ImageGroup, YmmpData } from "../src/types.ts";

const FIXTURE_DIR = path.join(import.meta.dir, "fixtures");
const SAMPLE_CSV = path.join(FIXTURE_DIR, "sample.csv");
const SAMPLE_YMMP = path.join(FIXTURE_DIR, "sample.ymmp");

describe("integration: CSV + ymmp pipeline (Step 1-4)", () => {
  test("reads CSV and extracts image groups", async () => {
    const groups = await readImageSheet(SAMPLE_CSV);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.imageId).toBeTruthy();
      expect(["AI", "実写", "図解"]).toContain(group.imageType);
    }
  });

  test("reads ymmp, extracts voices, and detects chapters", async () => {
    const data = await readYmmp(SAMPLE_YMMP);
    const items = getItems(data);
    expect(items.length).toBeGreaterThan(0);

    const voices = findVoiceItems(items);
    expect(voices.length).toBeGreaterThan(0);

    const chapters = detectChapters(items);
    expect(chapters.length).toBeGreaterThan(0);
  });

  test("matches CSV entries to voice items", async () => {
    const groups = await readImageSheet(SAMPLE_CSV);
    const data = await readYmmp(SAMPLE_YMMP);
    const items = getItems(data);
    const voices = findVoiceItems(items);

    const { blocks, failures } = matchEntries(groups, voices);
    // At least some matches should succeed with the sample data
    expect(blocks.length + failures.length).toBe(groups.length);
  });

  test("Step 4: inserts clipping ShapeItems for image blocks", async () => {
    const groups = await readImageSheet(SAMPLE_CSV);
    const data = await readYmmp(SAMPLE_YMMP);
    const items = getItems(data);
    const voices = findVoiceItems(items);
    const { blocks } = matchEntries(groups, voices);
    const initialCount = items.length;

    const inserted = step4_insertClipping(data, blocks);
    expect(inserted).toBe(blocks.length);
    expect(items.length).toBe(initialCount + blocks.length);

    // Verify inserted items are on the clipping layer
    const clippingItems = items.filter(
      (item) => item.Layer === LAYER_CLIPPING && item.Remark?.startsWith("ymm-auto:clipping:"),
    );
    expect(clippingItems.length).toBe(blocks.length);
  });

  test("Step 4: idempotency - second run inserts nothing", async () => {
    const groups = await readImageSheet(SAMPLE_CSV);
    const data = await readYmmp(SAMPLE_YMMP);
    const voices = findVoiceItems(getItems(data));
    const { blocks } = matchEntries(groups, voices);

    step4_insertClipping(data, blocks);
    const countAfterFirst = getItems(data).length;

    const insertedSecond = step4_insertClipping(data, blocks);
    expect(insertedSecond).toBe(0);
    expect(getItems(data).length).toBe(countAfterFirst);
  });
});

// ── Helper: create a minimal YmmpData structure ──────────────────────
function makeEmptyYmmpData(): YmmpData {
  return {
    FilePath: "test.ymmp",
    Timelines: [{ Items: [] }],
    Characters: [],
  };
}

function makeGroup(overrides: Partial<ImageGroup> = {}): ImageGroup {
  return {
    imageId: "001",
    description: "test image",
    imageType: "実写",
    referenceUrl: "",
    aiPrompt: "",
    entries: [],
    ...overrides,
  };
}

function makeBlock(overrides: Partial<ImageBlock> & { group?: Partial<ImageGroup> } = {}): ImageBlock {
  const { group: groupOverrides, ...blockOverrides } = overrides;
  return {
    group: makeGroup(groupOverrides),
    voiceItems: [],
    frame: 0,
    length: 300,
    ...blockOverrides,
  };
}

// ── Step 5: Insert photos/diagrams ───────────────────────────────────
describe("integration: Step 5 (step5_insertPhotos)", () => {
  let tmpDir: string;
  let photosDir: string;
  let resizedDir: string;

  beforeAll(async () => {
    // Use home directory for temp files because toWindowsUncPath requires paths under $HOME
    tmpDir = await fs.mkdtemp(path.join(os.homedir(), ".ymm-test-step5-"));
    photosDir = path.join(tmpDir, "photos");
    resizedDir = path.join(tmpDir, "resized");
    await fs.mkdir(photosDir, { recursive: true });

    // Create small test images with sharp
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .jpeg()
      .toFile(path.join(photosDir, "001.jpg"));

    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .png()
      .toFile(path.join(photosDir, "002.png"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("inserts photo images on Layer 11", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "001", imageType: "実写" }, frame: 0, length: 300 }),
    ];

    const result = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const items = getItems(data);
    const imageItems = items.filter((i) => i.Layer === LAYER_IMAGE);
    expect(imageItems.length).toBe(1);
    expect(imageItems[0].Frame).toBe(0);
    expect(imageItems[0].Length).toBe(300);
  });

  test("inserts diagram images on Layer 11", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "002", imageType: "図解" }, frame: 100, length: 200 }),
    ];

    const result = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const imageItems = getItems(data).filter((i) => i.Layer === LAYER_IMAGE);
    expect(imageItems.length).toBe(1);
    expect(imageItems[0].Frame).toBe(100);
    expect(imageItems[0].Length).toBe(200);
  });

  test("inserts reference text on Layer 12 when referenceUrl exists", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({
        group: { imageId: "001", imageType: "実写", referenceUrl: "https://example.com/ref" },
        frame: 0,
        length: 300,
      }),
    ];

    const result = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(result.inserted).toBe(1);

    const allItems = getItems(data);
    const refItems = allItems.filter((i) => i.Layer === LAYER_REFERENCE_TEXT);
    expect(refItems.length).toBe(1);
    expect(refItems[0].Frame).toBe(0);
    expect(refItems[0].Length).toBe(300);
  });

  test("does not insert reference text when referenceUrl is empty", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "001", imageType: "実写", referenceUrl: "" }, frame: 0, length: 300 }),
    ];

    await step5_insertPhotos(data, blocks, photosDir, resizedDir);

    const refItems = getItems(data).filter((i) => i.Layer === LAYER_REFERENCE_TEXT);
    expect(refItems.length).toBe(0);
  });

  test("idempotency - second run inserts nothing", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "001", imageType: "実写" }, frame: 0, length: 300 }),
    ];

    const first = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(first.inserted).toBe(1);

    const second = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toHaveLength(0);

    const imageItems = getItems(data).filter((i) => i.Layer === LAYER_IMAGE);
    expect(imageItems.length).toBe(1);
  });

  test("reports missing photo files in skipped array", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "missing_photo", imageType: "実写" }, frame: 0, length: 300 }),
    ];

    const result = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toContain("missing_photo");
  });

  test("skips AI-type blocks", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "001", imageType: "AI" }, frame: 0, length: 300 }),
    ];

    const result = await step5_insertPhotos(data, blocks, photosDir, resizedDir);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toHaveLength(0);
  });
});

// ── Step 7: Insert AI images ─────────────────────────────────────────
describe("integration: Step 7 (step7_insertAi)", () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    // Use home directory for temp files because toWindowsUncPath requires paths under $HOME
    tmpDir = await fs.mkdtemp(path.join(os.homedir(), ".ymm-test-step7-"));
    outputDir = path.join(tmpDir, "ai-output");
    await fs.mkdir(outputDir, { recursive: true });

    // Create test AI images named like step6 output: "{imageId}_{description}.jpg"
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .jpeg()
      .toFile(path.join(outputDir, "ai001_test_description.jpg"));

    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 0 } } })
      .jpeg()
      .toFile(path.join(outputDir, "ai002_another_image.jpg"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("inserts AI images on Layer 11", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "ai001", imageType: "AI" }, frame: 50, length: 400 }),
    ];

    const result = await step7_insertAi(data, blocks, outputDir);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const imageItems = getItems(data).filter((i) => i.Layer === LAYER_IMAGE);
    expect(imageItems.length).toBe(1);
    expect(imageItems[0].Frame).toBe(50);
    expect(imageItems[0].Length).toBe(400);
  });

  test("inserts multiple AI images", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "ai001", imageType: "AI" }, frame: 0, length: 300 }),
      makeBlock({ group: { imageId: "ai002", imageType: "AI" }, frame: 300, length: 200 }),
    ];

    const result = await step7_insertAi(data, blocks, outputDir);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toHaveLength(0);

    const imageItems = getItems(data).filter((i) => i.Layer === LAYER_IMAGE);
    expect(imageItems.length).toBe(2);
  });

  test("idempotency - second run inserts nothing", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "ai001", imageType: "AI" }, frame: 0, length: 300 }),
    ];

    const first = await step7_insertAi(data, blocks, outputDir);
    expect(first.inserted).toBe(1);

    const second = await step7_insertAi(data, blocks, outputDir);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toHaveLength(0);

    const imageItems = getItems(data).filter((i) => i.Layer === LAYER_IMAGE);
    expect(imageItems.length).toBe(1);
  });

  test("reports missing AI image files in skipped array", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "nonexistent", imageType: "AI" }, frame: 0, length: 300 }),
    ];

    const result = await step7_insertAi(data, blocks, outputDir);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toContain("nonexistent");
  });

  test("ignores non-AI blocks", async () => {
    const data = makeEmptyYmmpData();
    const blocks = [
      makeBlock({ group: { imageId: "ai001", imageType: "実写" }, frame: 0, length: 300 }),
    ];

    const result = await step7_insertAi(data, blocks, outputDir);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toHaveLength(0);
  });
});
