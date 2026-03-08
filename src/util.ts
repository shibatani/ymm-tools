import os from "node:os";

// Clipping area dimensions (placeholder — measure actual values in YMM)
export const CLIP_WIDTH = 960;
export const CLIP_HEIGHT = 540;

export const REMARK_PREFIX = "ymm-auto";

/**
 * Normalize serif text for matching:
 * Remove newlines, whitespace, then NFKC normalize
 */
export function normalizeSerif(s: string): string {
  return s
    .replace(/\\n/g, "") // literal \n in JSON
    .replace(/\n/g, "") // actual newlines
    .replace(/\s+/g, "") // all whitespace
    .normalize("NFKC");
}

/**
 * Convert Mac absolute path to Windows UNC path for ymmp
 * /Users/username/... → \\Mac\Home\...
 */
export function toWindowsUncPath(macPath: string): string {
  const home = os.homedir();
  if (!macPath.startsWith(home)) {
    throw new Error(
      `パスがホームディレクトリ配下ではありません: ${macPath}\nUNC変換にはホームディレクトリ（${home}）配下のパスが必要です`,
    );
  }
  return macPath.replace(home, "\\\\Mac\\Home").replace(/\//g, "\\");
}

/**
 * Calculate zoom percentage to fit image within clip area
 */
export function calcZoom(
  imgW: number,
  imgH: number,
  clipW: number = CLIP_WIDTH,
  clipH: number = CLIP_HEIGHT,
): number {
  return Math.min(clipW / imgW, clipH / imgH) * 100;
}

/**
 * Create remark string for idempotency
 */
export function makeRemark(imageId: string): string {
  return `${REMARK_PREFIX}:${imageId}`;
}

/**
 * Create AnimatedValue with a single value
 */
export function makeAnimatedValue(value: number): {
  Values: Array<{ Value: number }>;
  Span: number;
  AnimationType: string;
  Bezier: unknown;
} {
  return {
    Values: [{ Value: value }],
    Span: 0.0,
    AnimationType: "なし",
    Bezier: {
      Points: [
        {
          Point: { X: 0.0, Y: 0.0 },
          ControlPoint1: { X: -0.3, Y: -0.3 },
          ControlPoint2: { X: 0.3, Y: 0.3 },
        },
        {
          Point: { X: 1.0, Y: 1.0 },
          ControlPoint1: { X: -0.3, Y: -0.3 },
          ControlPoint2: { X: 0.3, Y: 0.3 },
        },
      ],
      IsQuadratic: false,
    },
  };
}
