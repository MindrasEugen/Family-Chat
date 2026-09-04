import { describe, it, expect, beforeEach } from "vitest";
import {
  escapeHtml,
  urlBase64ToUint8Array,
  roomInitial,
  formatPreviewText,
  loadRoomRegistry,
  saveRoomRegistry,
  upsertRegistryEntry,
  removeRegistryEntry,
  findLegacyStorageKey,
} from "../../lib/pure.js";

beforeEach(() => {
  localStorage.clear();
});

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(\"x\")&lt;/script&gt;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Ciao famiglia")).toBe("Ciao famiglia");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a URL-safe base64 string without padding", () => {
    // "hello" in base64 is "aGVsbG8=" -> URL-safe without padding: "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles URL-safe characters (- and _)", () => {
    // bytes [251, 255] -> base64 "-/8=" -> URL-safe "-_8"
    const result = urlBase64ToUint8Array("-_8");
    expect(Array.from(result)).toEqual([251, 255]);
  });
});

describe("roomInitial", () => {
  it("returns the uppercase first letter of a label", () => {
    expect(roomInitial("nonna maria")).toBe("N");
  });

  it("falls back to '?' when label is missing or blank", () => {
    expect(roomInitial(null)).toBe("?");
    expect(roomInitial("")).toBe("?");
    expect(roomInitial("   ")).toBe("?");
  });
});

describe("formatPreviewText", () => {
  it("returns a placeholder when there is no message", () => {
    expect(formatPreviewText(null)).toBe("Nessun messaggio");
  });

  it("returns the text content when present", () => {
    expect(formatPreviewText({ content: "Ciao!" })).toBe("Ciao!");
  });

  it("returns a photo placeholder when there is an image but no text", () => {
    expect(formatPreviewText({ content: "", image_path: "x.jpg" })).toBe("📷 Foto");
  });

  it("returns an empty string for an empty message", () => {
    expect(formatPreviewText({ content: "", image_path: null })).toBe("");
  });
});

describe("room registry", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadRoomRegistry()).toEqual([]);
  });

  it("returns an empty list when the stored value is corrupted JSON", () => {
    localStorage.setItem("chatFamiglia.rooms", "{not json");
    expect(loadRoomRegistry()).toEqual([]);
  });

  it("round-trips entries via saveRoomRegistry/loadRoomRegistry", () => {
    const entries = [{ storageKey: "sb-room-a", userId: "u1", label: "Nonna", pendingConfirmation: false }];
    saveRoomRegistry(entries);
    expect(loadRoomRegistry()).toEqual(entries);
  });

  it("upsertRegistryEntry adds a new entry", () => {
    upsertRegistryEntry({ storageKey: "sb-room-a", userId: "u1", label: "Nonna", pendingConfirmation: false });
    expect(loadRoomRegistry()).toHaveLength(1);
  });

  it("upsertRegistryEntry replaces an existing entry with the same storageKey", () => {
    upsertRegistryEntry({ storageKey: "sb-room-a", userId: "u1", label: "Nonna", pendingConfirmation: true });
    upsertRegistryEntry({ storageKey: "sb-room-a", userId: "u1", label: "Nonna", pendingConfirmation: false });
    const list = loadRoomRegistry();
    expect(list).toHaveLength(1);
    expect(list[0].pendingConfirmation).toBe(false);
  });

  it("upsertRegistryEntry keeps distinct entries for different storageKeys", () => {
    upsertRegistryEntry({ storageKey: "sb-room-a", userId: "u1", label: "Nonna", pendingConfirmation: false });
    upsertRegistryEntry({ storageKey: "sb-room-b", userId: "u2", label: "Nonno", pendingConfirmation: false });
    expect(loadRoomRegistry()).toHaveLength(2);
  });

  it("removeRegistryEntry removes only the matching storageKey", () => {
    upsertRegistryEntry({ storageKey: "sb-room-a", userId: "u1", label: "Nonna", pendingConfirmation: false });
    upsertRegistryEntry({ storageKey: "sb-room-b", userId: "u2", label: "Nonno", pendingConfirmation: false });
    removeRegistryEntry("sb-room-a");
    const list = loadRoomRegistry();
    expect(list).toHaveLength(1);
    expect(list[0].storageKey).toBe("sb-room-b");
  });

  it("findLegacyStorageKey finds a pre-multi-room supabase auth key", () => {
    localStorage.setItem("sb-qamvkevkddfwyxhbftoy-auth-token", "{}");
    expect(findLegacyStorageKey()).toBe("sb-qamvkevkddfwyxhbftoy-auth-token");
  });

  it("findLegacyStorageKey ignores keys already migrated to the room format", () => {
    localStorage.setItem("sb-room-abc123-auth-token", "{}");
    expect(findLegacyStorageKey()).toBeNull();
  });

  it("findLegacyStorageKey returns null when no auth key is present", () => {
    localStorage.setItem("some-other-key", "x");
    expect(findLegacyStorageKey()).toBeNull();
  });
});
