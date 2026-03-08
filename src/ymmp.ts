import fs from "node:fs/promises";
import type {
  AnimatedValue,
  Chapter,
  VoiceEntry,
  YmmpData,
  YmmpItem,
} from "./types.ts";
import { makeAnimatedValue, makeRemark, REMARK_PREFIX } from "./util.ts";

const VOICE_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker";
const IMAGE_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker";
const SHAPE_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker";
const TEXT_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker";

/**
 * Read ymmp file (BOM-aware)
 */
export async function readYmmp(filePath: string): Promise<YmmpData> {
  const raw = await Bun.file(filePath).text();
  const json = raw.replace(/^\uFEFF/, "");
  return JSON.parse(json) as YmmpData;
}

/**
 * Write ymmp file (with BOM, atomic via temp+rename)
 */
export async function writeYmmp(
  filePath: string,
  data: YmmpData,
): Promise<void> {
  const BOM = "\uFEFF";
  const tempPath = filePath + ".tmp";
  try {
    await Bun.write(tempPath, BOM + JSON.stringify(data));
    await fs.rename(tempPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

/**
 * Get all items from ymmp (throws if structure is invalid)
 */
export function getItems(data: YmmpData): YmmpItem[] {
  const items = data.Timelines[0]?.Items;
  if (!items) {
    throw new Error("ymmpに Timelines[0].Items がありません");
  }
  return items;
}

/**
 * Extract VoiceItems as VoiceEntry[]
 */
export function findVoiceItems(items: YmmpItem[]): VoiceEntry[] {
  return items
    .filter((item) => item.$type === VOICE_ITEM_TYPE)
    .map((item) => ({
      characterName: item.CharacterName ?? "",
      serif: item.Serif ?? "",
      frame: item.Frame,
      length: item.Length,
    }));
}

/**
 * Find a ShapeItem template on Layer 6
 */
export function findShapeTemplate(items: YmmpItem[]): YmmpItem | undefined {
  return items.find(
    (item) => item.$type === SHAPE_ITEM_TYPE && item.Layer === 6,
  );
}

/**
 * Detect chapter boundaries from transition ImageItems
 * Transitions are short (<=90 frames) ImageItems with "黒板背景" in FilePath
 */
export function detectChapters(items: YmmpItem[]): Chapter[] {
  // Find existing ShapeItems on Layer 6 (these define chapter boundaries)
  const shapeItems = items
    .filter((item) => item.$type === SHAPE_ITEM_TYPE && item.Layer === 6)
    .sort((a, b) => a.Frame - b.Frame);

  if (shapeItems.length > 0) {
    return shapeItems.map((item) => ({
      frame: item.Frame,
      length: item.Length,
    }));
  }

  // Fallback: detect from transition ImageItems
  const transitions = items
    .filter(
      (item) =>
        item.$type === IMAGE_ITEM_TYPE &&
        typeof item.FilePath === "string" &&
        item.FilePath.includes("黒板背景") &&
        item.Length <= 90,
    )
    .sort((a, b) => a.Frame - b.Frame);

  if (transitions.length === 0) return [];

  // Compute project end from the furthest item
  const projectEnd = items.reduce(
    (max, item) => Math.max(max, item.Frame + item.Length),
    0,
  );

  // Build chapter intervals from gaps between transitions
  const chapters: Chapter[] = [];
  // First chapter: from 0 to first transition
  const firstTransition = transitions[0]!;
  if (firstTransition.Frame > 0) {
    chapters.push({
      frame: 0,
      length: firstTransition.Frame,
    });
  }

  // Chapters between transitions
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i]!;
    const chapterStart = t.Frame + t.Length;
    const nextTransition = transitions[i + 1];
    const chapterEnd = nextTransition ? nextTransition.Frame : projectEnd;
    chapters.push({
      frame: chapterStart,
      length: chapterEnd - chapterStart,
    });
  }

  return chapters;
}

/**
 * Build a ShapeItem for Layer 10 (clipping template clone)
 */
export function buildShapeItem(
  template: YmmpItem,
  frame: number,
  length: number,
): YmmpItem {
  const clone = structuredClone(template);
  clone.Frame = frame;
  clone.Length = length;
  clone.Layer = 10;
  clone.Remark = `${REMARK_PREFIX}:clipping:${frame}`;
  return clone;
}

/**
 * Build an ImageItem for Layer 11 (inserted illustration)
 */
export function buildImageItem(
  template: YmmpItem | undefined,
  params: {
    filePath: string;
    frame: number;
    length: number;
    zoom: number;
    imageId: string;
  },
): YmmpItem {
  const x = template?.X
    ? structuredClone(template.X)
    : makeAnimatedValue(705.0);
  const y = template?.Y
    ? structuredClone(template.Y)
    : makeAnimatedValue(-459.0);

  return {
    $type: IMAGE_ITEM_TYPE,
    FilePath: params.filePath,
    X: x as AnimatedValue,
    Y: y as AnimatedValue,
    Z: makeAnimatedValue(0.0) as AnimatedValue,
    Opacity: makeAnimatedValue(100.0) as AnimatedValue,
    Zoom: makeAnimatedValue(params.zoom) as AnimatedValue,
    Rotation: makeAnimatedValue(0.0) as AnimatedValue,
    FadeIn: 0.0,
    FadeOut: 0.0,
    Blend: "Normal",
    IsInverted: false,
    IsClippingWithObjectAbove: true,
    IsAlwaysOnTop: false,
    IsZOrderEnabled: false,
    VideoEffects: [],
    Group: 0,
    Frame: params.frame,
    Layer: 11,
    KeyFrames: { Frames: [], Count: 0 },
    Length: params.length,
    PlaybackRate: 100.0,
    ContentOffset: "00:00:00",
    Remark: makeRemark(params.imageId),
    IsLocked: false,
    IsHidden: false,
  };
}

/**
 * Build a TextItem for Layer 12 (reference URL text)
 */
export function buildTextItem(params: {
  text: string;
  frame: number;
  length: number;
  imageId: string;
  imageX?: number;
  imageWidth?: number;
  zoom?: number;
}): YmmpItem {
  // X = imageX - (imageWidth * zoom / 100 / 2) to align with image left edge
  let textX = 0;
  if (
    params.imageX !== undefined &&
    params.imageWidth !== undefined &&
    params.zoom !== undefined
  ) {
    textX = params.imageX - (params.imageWidth * params.zoom) / 100 / 2;
  }

  return {
    $type: TEXT_ITEM_TYPE,
    Text: params.text,
    Font: "けいふぉんと",
    FontSize: 24.1, // YMM existing template value (not 24.0)
    BasePoint: "LeftTop",
    FontColor: "#FF000000",
    X: makeAnimatedValue(textX) as AnimatedValue,
    Y: makeAnimatedValue(-505.0) as AnimatedValue,
    Z: makeAnimatedValue(0.0) as AnimatedValue,
    Opacity: makeAnimatedValue(100.0) as AnimatedValue,
    Zoom: makeAnimatedValue(100.0) as AnimatedValue,
    Rotation: makeAnimatedValue(0.0) as AnimatedValue,
    FadeIn: 0.0,
    FadeOut: 0.0,
    Blend: "Normal",
    IsInverted: false,
    IsClippingWithObjectAbove: false,
    IsAlwaysOnTop: false,
    IsZOrderEnabled: false,
    VideoEffects: [],
    Group: 0,
    Frame: params.frame,
    Layer: 12,
    KeyFrames: { Frames: [], Count: 0 },
    Length: params.length,
    PlaybackRate: 100.0,
    ContentOffset: "00:00:00",
    Remark: makeRemark(params.imageId) + ":ref",
    IsLocked: true,
    IsHidden: false,
  };
}

/**
 * Check if an item with the given remark already exists (idempotency)
 */
export function hasRemark(items: YmmpItem[], remark: string): boolean {
  return items.some((item) => item.Remark === remark);
}
