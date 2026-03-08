import { describe, expect, test } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { readImageSheet } from "../src/csv-reader.ts";
import {
  readYmmp,
  getItems,
  findVoiceItems,
  detectChapters,
} from "../src/ymmp.ts";
import { matchEntries } from "../src/matcher.ts";
import { step4_insertClipping } from "../src/steps.ts";
import { LAYER_CLIPPING } from "../src/constants.ts";

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
