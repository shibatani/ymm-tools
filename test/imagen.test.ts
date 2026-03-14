import { describe, expect, test, mock, beforeEach } from "bun:test";
import { RETRYABLE_STATUS_CODES } from "../src/constants.ts";

// We test generateSingle indirectly via the exported test helper
// by mocking global fetch

describe("generateSingle retry logic", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns base64 on successful response", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ inlineData: { mimeType: "image/jpeg", data: "dGVzdA==" } }],
          },
        }],
      }),
    };
    globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as unknown as typeof fetch;

    const { _generateSingleForTest: generateSingle } = await import("../src/imagen.ts");
    const result = await generateSingle("test prompt", "fake-key");
    expect(result).toBe("dGVzdA==");
  });

  test("throws immediately on 400 Bad Request (non-retryable)", async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    };
    globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as unknown as typeof fetch;

    const { _generateSingleForTest: generateSingle } = await import("../src/imagen.ts");
    await expect(generateSingle("test prompt", "fake-key")).rejects.toThrow(
      "クライアントエラー (リトライ不可)",
    );
    // Should only be called once (no retries)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("throws immediately on 401 Unauthorized (non-retryable)", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    };
    globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as unknown as typeof fetch;

    const { _generateSingleForTest: generateSingle } = await import("../src/imagen.ts");
    await expect(generateSingle("test prompt", "fake-key")).rejects.toThrow(
      "クライアントエラー (リトライ不可)",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("throws immediately on 403 Forbidden (non-retryable)", async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    };
    globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as unknown as typeof fetch;

    const { _generateSingleForTest: generateSingle } = await import("../src/imagen.ts");
    await expect(generateSingle("test prompt", "fake-key")).rejects.toThrow(
      "クライアントエラー (リトライ不可)",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("RETRYABLE_STATUS_CODES contains expected codes", () => {
    expect(RETRYABLE_STATUS_CODES.has(429)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(500)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(502)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(503)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(504)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(400)).toBe(false);
    expect(RETRYABLE_STATUS_CODES.has(401)).toBe(false);
    expect(RETRYABLE_STATUS_CODES.has(403)).toBe(false);
  });

  test("throws on empty candidates", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: {} }] }),
    };
    globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as unknown as typeof fetch;

    const { _generateSingleForTest: generateSingle } = await import("../src/imagen.ts");
    await expect(generateSingle("test prompt", "fake-key")).rejects.toThrow(
      "APIからレスポンスが返されませんでした",
    );
  });

  test("throws on missing image data in parts", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: "some text response" }],
          },
        }],
      }),
    };
    globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as unknown as typeof fetch;

    const { _generateSingleForTest: generateSingle } = await import("../src/imagen.ts");
    await expect(generateSingle("test prompt", "fake-key")).rejects.toThrow(
      "APIから画像データが返されませんでした",
    );
  });
});
