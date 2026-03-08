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
export const API_CONCURRENCY = 5;

// AI image output size (match Midjourney output dimensions)
export const AI_IMAGE_WIDTH = 1456;
export const AI_IMAGE_HEIGHT = 816;

// Default zoom for inserted images (fits clipping area on Layer 10)
export const DEFAULT_IMAGE_ZOOM = 79.3;

// Filename sanitization
export const DESC_MAX_LENGTH = 50;

// HTTP status codes that are retryable (server/rate-limit errors)
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// Supported image extensions for YMM4
export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".bmp"]);
export const VIDEO_EXTENSIONS = new Set([".webp", ".mp4", ".avi", ".mov", ".wmv"]);
export const REJECTED_EXTENSIONS = new Set([".gif"]);
