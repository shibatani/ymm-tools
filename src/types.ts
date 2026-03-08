// CSV row representing an image entry
export interface ImageEntry {
  character: string; // キャラ
  serif: string; // セリフ
  imageId: string; // 画像ID
  description: string; // 必要な画像
  imageType: "AI" | "実写" | "図解"; // 画像種別
  referenceUrl: string; // 参考文献URL
  aiPrompt: string; // AI用プロンプト
}

// Grouped by imageId
export interface ImageGroup {
  imageId: string;
  description: string;
  imageType: "AI" | "実写" | "図解";
  referenceUrl: string;
  aiPrompt: string;
  entries: ImageEntry[];
}

// Extracted from ymmp VoiceItem
export interface VoiceEntry {
  characterName: string;
  serif: string;
  frame: number;
  length: number;
}

// Matching result: an image block with matched voice items
export interface ImageBlock {
  group: ImageGroup;
  voiceItems: VoiceEntry[];
  frame: number; // start frame (first voice item)
  length: number; // total length (first start to last end)
}

// Chapter boundary detected from transitions
export interface Chapter {
  frame: number;
  length: number;
}

// CLI arguments
export interface CliOptions {
  csv: string;
  ymmp: string;
  photos: string;
  output: string;
  dryRun: boolean;
  maxGenerate: number | undefined;
  clipWidth: number;
  clipHeight: number;
}

// AnimatedValue structure in ymmp
export interface AnimatedValue {
  Values: Array<{ Value: number }>;
  Span: number;
  AnimationType: string;
  Bezier: {
    Points: Array<{
      Point: { X: number; Y: number };
      ControlPoint1: { X: number; Y: number };
      ControlPoint2: { X: number; Y: number };
    }>;
    IsQuadratic: boolean;
  };
}

// Generic ymmp item (loosely typed)
export interface YmmpItem {
  $type: string;
  CharacterName?: string;
  Serif?: string;
  Hatsuon?: string;
  FilePath?: string;
  Text?: string;
  Font?: string;
  FontSize?: number | AnimatedValue;
  BasePoint?: string;
  FontColor?: string;
  ShapeType2?: string;
  ShapeParameter?: unknown;
  X?: AnimatedValue;
  Y?: AnimatedValue;
  Z?: AnimatedValue;
  Opacity?: AnimatedValue;
  Zoom?: AnimatedValue;
  Rotation?: AnimatedValue;
  FadeIn?: number;
  FadeOut?: number;
  Blend?: string;
  IsInverted?: boolean;
  IsClippingWithObjectAbove?: boolean;
  IsAlwaysOnTop?: boolean;
  IsZOrderEnabled?: boolean;
  VideoEffects?: unknown[];
  Group?: number;
  Frame: number;
  Length: number;
  Layer: number;
  KeyFrames?: { Frames: unknown[]; Count: number };
  PlaybackRate?: number;
  ContentOffset?: string;
  Remark?: string;
  IsLocked?: boolean;
  IsHidden?: boolean;
  [key: string]: unknown;
}

// Top-level ymmp structure
export interface YmmpData {
  FilePath: string;
  Timelines: Array<{ Items: YmmpItem[] }>;
  Characters: unknown[];
  [key: string]: unknown;
}

// Match report entry
export interface MatchFailure {
  imageId: string;
  serif: string;
  reason: string;
}
