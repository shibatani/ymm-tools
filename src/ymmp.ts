import fs from "node:fs/promises";
import type {
  AnimatedValue,
  Chapter,
  VoiceEntry,
  YmmpData,
  YmmpItem,
} from "./types.ts";
import { makeAnimatedValue, makeRemark, REMARK_PREFIX } from "./util.ts";
import {
  LAYER_SHAPE_TEMPLATE,
  LAYER_CLIPPING,
  LAYER_IMAGE,
  LAYER_REFERENCE_TEXT,
  MAX_TRANSITION_LENGTH,
  DEFAULT_IMAGE_X,
  DEFAULT_IMAGE_Y,
  REFERENCE_TEXT_X,
  REFERENCE_TEXT_Y,
  REFERENCE_FONT_SIZE,
} from "./constants.ts";

const VOICE_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.VoiceItem, YukkuriMovieMaker";
const IMAGE_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker";
const SHAPE_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker";
const TEXT_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker";
const VIDEO_ITEM_TYPE =
  "YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker";

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
 * Find a ShapeItem template on the title template layer (Layer 6)
 */
export function findShapeTemplate(items: YmmpItem[]): YmmpItem | undefined {
  return items.find(
    (item) => item.$type === SHAPE_ITEM_TYPE && item.Layer === LAYER_SHAPE_TEMPLATE,
  );
}


/**
 * Detect chapter boundaries from transition ImageItems
 * Transitions are short (<=MAX_TRANSITION_LENGTH frames) ImageItems with "黒板背景" in FilePath
 */
export function detectChapters(items: YmmpItem[]): Chapter[] {
  // Find existing ShapeItems on template layer (these define chapter boundaries)
  const shapeItems = items
    .filter((item) => item.$type === SHAPE_ITEM_TYPE && item.Layer === LAYER_SHAPE_TEMPLATE)
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
        item.Length <= MAX_TRANSITION_LENGTH,
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
 * Build a ShapeItem for the clipping layer (Layer 10, hardcoded blackboard style)
 */
export function buildClippingShapeItem(
  frame: number,
  length: number,
): YmmpItem {
  return {
    $type: SHAPE_ITEM_TYPE,
    ShapeType2: "YukkuriMovieMaker.Shape.QuadrilateralShapePlugin, YukkuriMovieMaker, Version=4.50.0.3, Culture=neutral, PublicKeyToken=null",
    ShapeParameter: {
      $type: "YukkuriMovieMaker.Project.Items.RectangleShapeParameter, YukkuriMovieMaker",
      Round: makeAnimatedValue(0),
      SizeMode: "SizeAspect",
      Size: makeAnimatedValue(1129.1),
      AspectRate: makeAnimatedValue(-44.4),
      Width: makeAnimatedValue(100),
      Height: makeAnimatedValue(100),
      StrokeThickness: makeAnimatedValue(4000),
      Brush: {
        Type: "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushPlugin, YukkuriMovieMaker, Version=4.50.0.3, Culture=neutral, PublicKeyToken=null",
        Parameter: {
          $type: "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushParameter, YukkuriMovieMaker",
          Color: "#FF184233",
        },
      },
    },
    X: makeAnimatedValue(DEFAULT_IMAGE_X) as AnimatedValue,
    Y: makeAnimatedValue(DEFAULT_IMAGE_Y) as AnimatedValue,
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
    Frame: frame,
    Layer: LAYER_CLIPPING,
    KeyFrames: { Frames: [], Count: 0 },
    Length: length,
    PlaybackRate: 100.0,
    ContentOffset: "00:00:00",
    Remark: `${REMARK_PREFIX}:clipping:${frame}`,
    IsLocked: false,
    IsHidden: false,
  };
}

/**
 * Build an ImageItem for the image layer (inserted illustration)
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
    : makeAnimatedValue(DEFAULT_IMAGE_X);
  const y = template?.Y
    ? structuredClone(template.Y)
    : makeAnimatedValue(DEFAULT_IMAGE_Y);

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
    Layer: LAYER_IMAGE,
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
 * Build a VideoItem for the image layer (webp/video files, looped)
 */
export function buildVideoItem(
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
    : makeAnimatedValue(DEFAULT_IMAGE_X);
  const y = template?.Y
    ? structuredClone(template.Y)
    : makeAnimatedValue(DEFAULT_IMAGE_Y);

  return {
    $type: VIDEO_ITEM_TYPE,
    IsWaveformEnabled: false,
    FilePath: params.filePath,
    AudioTrackIndex: 0,
    Volume: makeAnimatedValue(50.0),
    Pan: makeAnimatedValue(0.0),
    EchoIsEnabled: false,
    EchoInterval: 0.1,
    EchoAttenuation: 40,
    AudioEffects: [],
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
    IsLooped: true,
    VideoEffects: [],
    Group: 0,
    Frame: params.frame,
    Layer: LAYER_IMAGE,
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
 * Build a TextItem for the reference text layer (reference URL text)
 * Matches the style of existing reference text items in ymmp templates.
 */
export function buildTextItem(params: {
  text: string;
  frame: number;
  length: number;
  imageId: string;
  imageWidth?: number;
  zoom?: number;
}): YmmpItem {
  // Align text left edge to image left edge
  // Image left edge = DEFAULT_IMAGE_X - (imageWidth * zoom / 100 / 2)
  let textX = REFERENCE_TEXT_X;
  if (params.imageWidth !== undefined && params.zoom !== undefined) {
    textX = DEFAULT_IMAGE_X - (params.imageWidth * params.zoom) / 100 / 2;
  }

  return {
    $type: TEXT_ITEM_TYPE,
    Text: params.text,
    Decorations: [],
    Font: "けいふぉんと",
    FontSize: makeAnimatedValue(REFERENCE_FONT_SIZE),
    LineHeight2: makeAnimatedValue(100),
    LetterSpacing2: makeAnimatedValue(0),
    WordWrap: "NoWrap",
    MaxWidth: makeAnimatedValue(1920),
    BasePoint: "LeftTop",
    FontColor: "#FFFFFFFF",
    Style: "Normal",
    StyleColor: "#FF000000",
    Bold: false,
    Italic: false,
    IsTrimEndSpace: false,
    IsDevidedPerCharacter: false,
    DisplayInterval: 0,
    DisplayDirection: "FromFirst",
    HideInterval: 0,
    HideDirection: "FromFirst",
    X: makeAnimatedValue(textX) as AnimatedValue,
    Y: makeAnimatedValue(REFERENCE_TEXT_Y) as AnimatedValue,
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
    Layer: LAYER_REFERENCE_TEXT,
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
