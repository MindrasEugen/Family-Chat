import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateText } from "./translator.js";

beforeEach(() => {
  globalThis.SUPABASE_URL = "https://test-project.supabase.co";
  globalThis.SUPABASE_ANON_KEY = "test-anon-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.SUPABASE_URL;
  delete globalThis.SUPABASE_ANON_KEY;
});

function mockFetchJson(payload, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      json: async () => payload,
    }))
  );
}

describe("translateText", () => {
  it("returns an empty string without calling fetch when the text is blank", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(translateText("   ", "fr")).resolves.toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported target languages without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(translateText("Ciao", "de")).rejects.toThrow("non supportata");
    await expect(translateText("Ciao", "")).rejects.toThrow("non supportata");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("translates to French via the translate-message edge function", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ translatedText: "Bonjour" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(translateText("Ciao", "fr")).resolves.toBe("Bonjour");

    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://test-project.supabase.co/functions/v1/translate-message");
    expect(calledOpts.headers.apikey).toBe("test-anon-key");
    expect(calledOpts.headers.Authorization).toBe("Bearer test-anon-key");
    expect(JSON.parse(calledOpts.body)).toEqual({ text: "Ciao", targetLang: "fr" });
  });

  it("translates to English via the translate-message edge function", async () => {
    mockFetchJson({ translatedText: "Hello" });
    await expect(translateText("Ciao", "en")).resolves.toBe("Hello");
    const [, calledOpts] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(calledOpts.body)).toEqual({ text: "Ciao", targetLang: "en" });
  });

  it("does not assume or send a source language: the edge function autodetects it", async () => {
    mockFetchJson({ translatedText: "Hello" });
    await translateText("Ciao", "en");
    const [, calledOpts] = vi.mocked(fetch).mock.calls[0];
    const sentBody = JSON.parse(calledOpts.body);
    expect(sentBody).not.toHaveProperty("sourceLang");
    expect(sentBody).not.toHaveProperty("langpair");
    expect(Object.keys(sentBody).sort()).toEqual(["targetLang", "text"]);
  });

  it("throws when the edge function answers with an HTTP error", async () => {
    mockFetchJson({ error: "Mistral API error" }, false, 502);
    await expect(translateText("Ciao", "fr")).rejects.toThrow("502");
  });

  it("throws when the edge function answer has no translatedText", async () => {
    mockFetchJson({ error: "Translation not configured" });
    await expect(translateText("Ciao", "fr")).rejects.toThrow("non valida");
  });
});
