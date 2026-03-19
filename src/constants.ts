// YMM layer numbers
export const LAYER_SHAPE_TEMPLATE = 6;
export const LAYER_CLIPPING = 10;
export const LAYER_IMAGE = 11;
export const LAYER_REFERENCE_TEXT = 12;

// YMM item defaults
export const MAX_TRANSITION_LENGTH = 90;
export const DEFAULT_IMAGE_X = -2.5;
export const DEFAULT_IMAGE_Y = -154.0;
export const REFERENCE_TEXT_X = -560.0;
export const REFERENCE_TEXT_Y = -505.0;
export const REFERENCE_FONT_SIZE = 24.1;

// API settings
export const API_CONCURRENCY = 2;

// AI image output size (match Midjourney output dimensions)
export const AI_IMAGE_WIDTH = 1456;
export const AI_IMAGE_HEIGHT = 816;

// Default zoom for inserted images (fits clipping area on Layer 10)
export const DEFAULT_IMAGE_ZOOM = 79.3;

// Filename sanitization
export const DESC_MAX_LENGTH = 50;

// HTTP status codes that are retryable (server/rate-limit errors)
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// Default prompt style and negative
export const DEFAULT_STYLE = "soft watercolor anime illustration, muted warm colors. Two characters: reimu and marisa from touhou project.";
export const DEFAULT_NEGATIVE = "No text, no letters, no words, no numbers";

// Supported image extensions for YMM4
export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".bmp"]);
export const VIDEO_EXTENSIONS = new Set([".webp", ".mp4", ".avi", ".mov", ".wmv"]);
export const REJECTED_EXTENSIONS = new Set([".gif"]);

// --- Template command constants ---

// テンプレートアセットパス（Windows UNC パス）
export const TEMPLATE_ASSETS = {
  background: "\\\\Mac\\Home\\Downloads\\nc397219_木枠付き黒板風背景（1920×1080・透過無し）.png",
  serifFrame: "\\\\Mac\\Home\\Downloads\\nc265534_セリフ枠（羊皮紙風）1920x1080.png",
  titleBackground: "\\\\Mac\\Home\\Downloads\\nc431747_黒板背景.png",
  se: "\\\\Mac\\Home\\Downloads\\決定ボタンを押す1 (2).mp3",
  bgmIntro: "C:\\動画作成\\BGM\\少年達の夏休み的なBGM.mp3",
  bgmMain: "C:\\動画作成\\BGM\\昼下がり気分.mp3",
  bgmOutro: "C:\\動画作成\\BGM\\極東の羊、テレキャスターと踊る.mp3",
};

// テンプレートレイヤー番号
export const TMPL_LAYER = {
  BGM: 1,
  content: {
    SERIF_FRAME: 2,
    BACKGROUND: 3,
    TACHIE_MARISA: 4,
    TACHIE_REIMU: 5,
    SHAPE: 6,
    SECTION_TITLE: 7,
  },
  titleCard: {
    BG: 5,
    REIMU: 6,
    MARISA: 7,
    TEXT: 8,
    SE: 9,
  },
  VOICE_1: 8,
  VOICE_2: 9,
};

// タイトルカード表示時間
export const TITLE_CARD_LENGTH = 90;

// 音量設定
export const BGM_VOLUME = 5.0;
export const SE_VOLUME = 50.0;

// SE の実際の音声長さ (frames)
export const SE_LENGTH = 53;

// 立ち絵の表情パーツ
export const FACE_NORMAL = { eyebrow: "00.png", eye: "00.png", mouth: "00.png" };
export const FACE_TITLE = { eyebrow: "12.png", eye: "26.png", mouth: "22.png" };

// 立ち絵のキャラクターフォルダ
export const TACHIE_FOLDERS = {
  reimu: "C:\\れいむ",
  marisa: "C:\\まりさ",
};

// コンテンツセクション座標
export const CONTENT_POS = {
  reimu: { x: -780.0, y: 75.0, zoom: 115.0, isInverted: true },
  marisa: { x: 740.0, y: 85.0, zoom: 115.0, isInverted: false },
  background: { x: 0.0, y: -154.0, zoom: 71.75 },
  serifFrame: { x: 197.5, y: -114.0, zoom: 130.01 },
  shape: { x: 705.0, y: -459.0, zoom: 100.0 },
};

// タイトルカード座標
export const TITLE_POS = {
  reimu: { x: 703.0, y: -367.0, zoom: 150.0, rotation: 20.104094892382797, isInverted: false },
  marisa: { x: -718.0, y: 286.0, zoom: 150.0, rotation: -25.669291765566804, isInverted: true },
  background: { x: 0.0, y: 0.0, zoom: 88.0 },
};
