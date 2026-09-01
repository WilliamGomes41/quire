import { afterEach, describe, expect, it } from "vitest";
import { resetMemoryDb } from "../src/lib/db";
import { saveClip, type Clip, type ClipStore } from "../src/lib/save";
import { clipStore } from "../src/lib/store";

function memoryStore(): ClipStore & { rows: Map<string, Clip> } {
  const rows = new Map<string, Clip>();
  return {
    rows,
    async insert(clip) {
      rows.set(clip.id, clip);
      return clip;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
  };
}

describe("Keep always saves", () => {
  afterEach(() => {
    resetMemoryDb();
  });

  it("persists the clip when Grok fails", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/kept" }, store, {
      grok: async () => {
        throw new Error("model down");
      },
    });

    expect(clip.url).toBe("https://example.com/kept");
    expect(store.rows.get(clip.id)?.url).toBe("https://example.com/kept");
  });

  it("persists the clip when search fails", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/search-fail" }, store, {
      search: async () => {
        throw new Error("search unconfigured");
      },
    });

    expect(store.rows.has(clip.id)).toBe(true);
  });

  it("persists the clip when Grok and search both fail", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/both-fail" }, store, {
      grok: async () => {
        throw new Error("no XAI_API_KEY");
      },
      search: async () => {
        throw new Error("timeout");
      },
    });

    const stored = await store.get(clip.id);
    expect(stored).toEqual(clip);
  });

  it("writes the row before enrichment runs", async () => {
    const store = memoryStore();
    let sawRow = false;
    await saveClip({ url: "https://example.com/order" }, store, {
      grok: async () => {
        sawRow = store.rows.size === 1;
        throw new Error("after persist");
      },
    });
    expect(sawRow).toBe(true);
  });

  it("persists through PGLite when enrichment fails", async () => {
    const store = await clipStore("test-owner");
    const clip = await saveClip({ url: "https://example.com/pglite" }, store, {
      grok: async () => {
        throw new Error("grok failed");
      },
      search: async () => {
        throw new Error("search failed");
      },
    });
    const stored = await store.get(clip.id);
    expect(stored?.url).toBe("https://example.com/pglite");
  });
});
