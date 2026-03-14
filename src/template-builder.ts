import type { YmmpItem } from "./types.ts";
import { makeAnimatedValue } from "./util.ts";
import {
  TEMPLATE_ASSETS,
  TMPL_LAYER,
  TITLE_CARD_LENGTH,
  BGM_VOLUME,
  SE_VOLUME,
  SE_LENGTH,
  FACE_NORMAL,
  FACE_TITLE,
  TACHIE_FOLDERS,
  CONTENT_POS,
  TITLE_POS,
} from "./constants.ts";

// --- Common item structures ---

const ITEM_TYPES = {
  tachie: "YukkuriMovieMaker.Project.Items.TachieItem, YukkuriMovieMaker",
  image: "YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker",
  text: "YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker",
  audio: "YukkuriMovieMaker.Project.Items.AudioItem, YukkuriMovieMaker",
  shape: "YukkuriMovieMaker.Project.Items.ShapeItem, YukkuriMovieMaker",
};

const TACHIE_PARAM_TYPE =
  "YukkuriMovieMaker.Plugin.Tachie.AnimationTachie.ItemParameter, YukkuriMovieMaker.Plugin.Tachie.AnimationTachie";

function baseVisualProps(
  x: number,
  y: number,
  zoom: number,
  frame: number,
  length: number,
  layer: number,
  opts?: { rotation?: number; isInverted?: boolean; isLocked?: boolean },
): Partial<YmmpItem> {
  return {
    X: makeAnimatedValue(x),
    Y: makeAnimatedValue(y),
    Z: makeAnimatedValue(0),
    Opacity: makeAnimatedValue(100),
    Zoom: makeAnimatedValue(zoom),
    Rotation: makeAnimatedValue(opts?.rotation ?? 0),
    FadeIn: 0,
    FadeOut: 0,
    Blend: "Normal",
    IsInverted: opts?.isInverted ?? false,
    IsClippingWithObjectAbove: false,
    IsAlwaysOnTop: false,
    IsZOrderEnabled: false,
    VideoEffects: [],
    Group: 0,
    Frame: frame,
    Layer: layer,
    KeyFrames: { Frames: [], Count: 0 },
    Length: length,
    PlaybackRate: 100,
    ContentOffset: "00:00:00",
    Remark: "",
    IsLocked: opts?.isLocked ?? true,
    IsHidden: false,
  };
}

// --- TachieItem builders ---

function buildTachieItemParameter(
  folder: string,
  face: { eyebrow: string; eye: string; mouth: string },
) {
  return {
    $type: TACHIE_PARAM_TYPE,
    IsHiddenWhenNoSpeech: false,
    Eyebrow: `${folder}\\眉\\${face.eyebrow}`,
    Eye: `${folder}\\目\\${face.eye}`,
    Mouth: `${folder}\\口\\${face.mouth}`,
    Hair: `${folder}\\髪\\00.png`,
    Complexion: null,
    Body: `${folder}\\体\\00.png`,
    Back1: null,
    Back2: null,
    Back3: null,
    Etc1: null,
    Etc2: null,
    Etc3: null,
  };
}

function buildTachieItem(
  characterName: string,
  folder: string,
  face: { eyebrow: string; eye: string; mouth: string },
  pos: { x: number; y: number; zoom: number; rotation?: number; isInverted?: boolean },
  frame: number,
  length: number,
  layer: number,
): YmmpItem {
  return {
    $type: ITEM_TYPES.tachie,
    CharacterName: characterName,
    TachieItemParameter: buildTachieItemParameter(folder, face),
    ...baseVisualProps(pos.x, pos.y, pos.zoom, frame, length, layer, {
      rotation: pos.rotation,
      isInverted: pos.isInverted,
    }),
  } as YmmpItem;
}

// --- ImageItem builder ---

function buildImageItem(
  filePath: string,
  pos: { x: number; y: number; zoom: number },
  frame: number,
  length: number,
  layer: number,
): YmmpItem {
  return {
    $type: ITEM_TYPES.image,
    FilePath: filePath,
    ...baseVisualProps(pos.x, pos.y, pos.zoom, frame, length, layer),
  } as YmmpItem;
}

// --- AudioItem builder ---

function buildAudioItem(
  filePath: string,
  volume: number,
  frame: number,
  length: number,
  layer: number,
): YmmpItem {
  return {
    $type: ITEM_TYPES.audio,
    IsWaveformEnabled: false,
    FilePath: filePath,
    AudioTrackIndex: 0,
    Volume: makeAnimatedValue(volume),
    Pan: makeAnimatedValue(0),
    PlaybackRate: 100,
    ContentOffset: "00:00:00",
    FadeIn: 0,
    FadeOut: 0,
    IsLooped: false,
    EchoIsEnabled: false,
    EchoInterval: 0.1,
    EchoAttenuation: 40,
    AudioEffects: [],
    Group: 0,
    Frame: frame,
    Layer: layer,
    KeyFrames: { Frames: [], Count: 0 },
    Length: length,
    Remark: "",
    IsLocked: false,
    IsHidden: false,
  } as YmmpItem;
}

// --- ShapeItem builder ---

function buildShapeItem(
  frame: number,
  length: number,
  layer: number,
): YmmpItem {
  return {
    $type: ITEM_TYPES.shape,
    ShapeType2:
      "YukkuriMovieMaker.Shape.QuadrilateralShapePlugin, YukkuriMovieMaker, Version=4.50.0.3, Culture=neutral, PublicKeyToken=null",
    ShapeParameter: {
      $type:
        "YukkuriMovieMaker.Project.Items.RectangleShapeParameter, YukkuriMovieMaker",
      Round: makeAnimatedValue(0),
      SizeMode: "SizeAspect",
      Size: makeAnimatedValue(507.3),
      AspectRate: makeAnimatedValue(-68.5),
      Width: makeAnimatedValue(100),
      Height: makeAnimatedValue(100),
      StrokeThickness: makeAnimatedValue(4000),
      Brush: {
        Type: "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushPlugin, YukkuriMovieMaker, Version=4.50.0.3, Culture=neutral, PublicKeyToken=null",
        Parameter: {
          $type:
            "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushParameter, YukkuriMovieMaker",
          Color: "#FFFFFFFF",
        },
      },
    },
    ...baseVisualProps(
      CONTENT_POS.shape.x,
      CONTENT_POS.shape.y,
      CONTENT_POS.shape.zoom,
      frame,
      length,
      layer,
    ),
    VideoEffects: [
      {
        $type:
          "YukkuriMovieMaker.Plugin.Community.Effect.Video.InnerOutline.InnerOutlineEffect, YukkuriMovieMaker.Plugin.Community",
        Thickness: makeAnimatedValue(5),
        Opacity: makeAnimatedValue(100),
        Blur: makeAnimatedValue(0),
        Blend: "Normal",
        IsOutlineOnly: false,
        Brush: {
          Type: "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushPlugin, YukkuriMovieMaker, Version=4.50.0.3, Culture=neutral, PublicKeyToken=null",
          Parameter: {
            $type:
              "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushParameter, YukkuriMovieMaker",
            Color: "#FF000000",
          },
        },
        IsEnabled: true,
        Remark: "",
      },
    ],
  } as YmmpItem;
}

// --- TextItem builders ---

/** Font size for title card text (fixed 150pt, line breaks are CSV-controlled) */
export function titleCardFontSize(_text: string): number {
  return 150;
}

/** Compute font size for section title text based on character count */
export function sectionTitleFontSize(text: string): number {
  const len = text.replace(/\r?\n/g, "").length;
  if (len <= 5) return 89.9;
  if (len <= 8) {
    // 5〜8文字: 枠に適切なpaddingを持つよう動的に縮小
    // 5文字で89.9pt、8文字で64pt に線形補間
    return 89.9 - (89.9 - 64) * (len - 5) / 3;
  }
  // 8文字超: 2行表示
  return 61.8;
}

/**
 * Auto-wrap text for section title display.
 * If text already contains newlines (from CSV), preserve them.
 * Otherwise, split at midpoint if exceeding maxCharsPerLine.
 */
export function autoWrap(text: string, maxCharsPerLine: number): string {
  // CSV から改行が入っていればそのまま使う（\n → \r\n に正規化）
  if (text.includes("\n")) {
    return text.replace(/\r?\n/g, "\r\n");
  }
  if (text.length <= maxCharsPerLine) return text;
  // フォールバック: 中間付近で改行
  const mid = Math.ceil(text.length / 2);
  return text.slice(0, mid) + "\r\n" + text.slice(mid);
}

function buildTextItem(
  text: string,
  fontSize: number,
  fontColor: string,
  x: number,
  y: number,
  frame: number,
  length: number,
  layer: number,
  withOutline: boolean,
): YmmpItem {
  const effects: unknown[] = withOutline
    ? [
        {
          $type:
            "YukkuriMovieMaker.Project.Effects.OutlineEffect, YukkuriMovieMaker",
          StrokeThickness: makeAnimatedValue(10),
          Blur: makeAnimatedValue(0),
          Quality: makeAnimatedValue(64),
          Smoothness: makeAnimatedValue(100),
          X: makeAnimatedValue(0),
          Y: makeAnimatedValue(0),
          Opacity: makeAnimatedValue(100),
          Zoom: makeAnimatedValue(100),
          Rotation: makeAnimatedValue(0),
          StrokeBrush: {
            Type: "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushPlugin, YukkuriMovieMaker, Version=4.50.0.3, Culture=neutral, PublicKeyToken=null",
            Parameter: {
              $type:
                "YukkuriMovieMaker.Plugin.Brush.SolidColorBrushParameter, YukkuriMovieMaker",
              Color: "#FF000000",
            },
          },
          IsOutlineOnly: false,
          IsAngular: false,
          IsEnabled: true,
          Remark: "",
        },
      ]
    : [];

  return {
    $type: ITEM_TYPES.text,
    Text: text,
    Decorations: [],
    Font: "けいふぉんと",
    FontSize: makeAnimatedValue(fontSize),
    LineHeight2: makeAnimatedValue(100),
    LetterSpacing2: makeAnimatedValue(0),
    WordWrap: "NoWrap",
    MaxWidth: makeAnimatedValue(1920),
    BasePoint: "CenterCenter",
    FontColor: fontColor,
    Style: "Normal",
    StyleColor: "#FF000000",
    Bold: false,
    Italic: false,
    IsTrimEndSpace: false,
    IsDevidedPerCharacter: false,
    DisplayInterval: 0.0,
    DisplayDirection: "FromFirst",
    HideInterval: 0.0,
    HideDirection: "FromFirst",
    ...baseVisualProps(x, y, zoom, frame, length, layer),
    VideoEffects: effects,
  } as YmmpItem;
}

// Zoom is always 100 for text items
const zoom = 100;

// --- Public API ---

/**
 * Build all items for a title card (90 frames).
 */
export function buildTitleCardItems(
  frame: number,
  titleText: string,
): YmmpItem[] {
  const length = TITLE_CARD_LENGTH;
  // 改行はCSV側で制御。\n → \r\n に正規化のみ
  const wrappedText = titleText.replace(/\r?\n/g, "\r\n");
  const fontSize = titleCardFontSize(titleText);

  return [
    // Layer 5: Title card background
    buildImageItem(
      TEMPLATE_ASSETS.titleBackground,
      TITLE_POS.background,
      frame,
      length,
      TMPL_LAYER.titleCard.BG,
    ),
    // Layer 6: Reimu (title face)
    buildTachieItem(
      "ゆっくり霊夢",
      TACHIE_FOLDERS.reimu,
      FACE_TITLE,
      TITLE_POS.reimu,
      frame,
      length,
      TMPL_LAYER.titleCard.REIMU,
    ),
    // Layer 7: Marisa (title face)
    buildTachieItem(
      "ゆっくり魔理沙",
      TACHIE_FOLDERS.marisa,
      FACE_TITLE,
      TITLE_POS.marisa,
      frame,
      length,
      TMPL_LAYER.titleCard.MARISA,
    ),
    // Layer 8: Title text (white with black outline)
    buildTextItem(
      wrappedText,
      fontSize,
      "#FFFFFFFF",
      0, // Center BasePoint → X=0 for centered
      0, // Y=0 for centered
      frame,
      length,
      TMPL_LAYER.titleCard.TEXT,
      true, // with outline
    ),
    // Layer 9: SE
    buildAudioItem(
      TEMPLATE_ASSETS.se,
      SE_VOLUME,
      frame,
      SE_LENGTH,
      TMPL_LAYER.titleCard.SE,
    ),
  ];
}

/**
 * Build all items for a content section (variable length).
 */
export function buildContentSectionItems(
  frame: number,
  length: number,
  sectionTitle: string,
  bgmPath: string,
): YmmpItem[] {
  const items: YmmpItem[] = [
    // Layer 1: BGM
    buildAudioItem(
      bgmPath,
      BGM_VOLUME,
      frame,
      length,
      TMPL_LAYER.BGM,
    ),
    // Layer 2: Serif frame
    buildImageItem(
      TEMPLATE_ASSETS.serifFrame,
      CONTENT_POS.serifFrame,
      frame,
      length,
      TMPL_LAYER.content.SERIF_FRAME,
    ),
    // Layer 3: Background
    buildImageItem(
      TEMPLATE_ASSETS.background,
      CONTENT_POS.background,
      frame,
      length,
      TMPL_LAYER.content.BACKGROUND,
    ),
    // Layer 4: Marisa (normal face)
    buildTachieItem(
      "ゆっくり魔理沙",
      TACHIE_FOLDERS.marisa,
      FACE_NORMAL,
      CONTENT_POS.marisa,
      frame,
      length,
      TMPL_LAYER.content.TACHIE_MARISA,
    ),
    // Layer 5: Reimu (normal face)
    buildTachieItem(
      "ゆっくり霊夢",
      TACHIE_FOLDERS.reimu,
      FACE_NORMAL,
      CONTENT_POS.reimu,
      frame,
      length,
      TMPL_LAYER.content.TACHIE_REIMU,
    ),
    // Layer 6: Shape
    buildShapeItem(frame, length, TMPL_LAYER.content.SHAPE),
  ];

  // Layer 7: Section title (only if sectionTitle is non-empty)
  if (sectionTitle) {
    const wrappedTitle = autoWrap(sectionTitle, 8);
    const fontSize = sectionTitleFontSize(sectionTitle);
    items.push(
      buildTextItem(
        wrappedTitle,
        fontSize,
        "#FF000000", // black text
        CONTENT_POS.shape.x, // centered on shape X
        CONTENT_POS.shape.y, // centered on shape Y
        frame,
        length,
        TMPL_LAYER.content.SECTION_TITLE,
        false, // no outline
      ),
    );
  }

  return items;
}

/**
 * Select BGM path based on section index.
 */
export function selectBgm(
  sectionIndex: number,
  totalSections: number,
): string {
  if (sectionIndex === 0) return TEMPLATE_ASSETS.bgmIntro;
  if (sectionIndex === totalSections - 1) return TEMPLATE_ASSETS.bgmOutro;
  return TEMPLATE_ASSETS.bgmMain;
}
