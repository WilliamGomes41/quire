import { afterEach, describe, expect, it } from "vitest";
import { resetMemoryDb } from "../src/lib/db";
import { saveClip, type Clip, type ClipStore } from "../src/lib/save";
import { clipStore } from "../src/lib/store";
import type { Understanding, UnderstandingRecord } from "../src/lib/understanding";

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
    async persistUnderstanding(id, record) {
      const clip = rows.get(id);
      if (!clip) throw new Error("missing clip");
      rows.set(id, { ...clip, understanding: record });
    },
  };
}

describe("Keep always saves", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
  });

  it("persists the clip when understanding throws", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/kept" }, store, {
      understand: async () => {
        throw new Error("model down");
      },
    });

    expect(clip.url).toBe("https://example.com/kept");
    expect(store.rows.get(clip.id)?.url).toBe("https://example.com/kept");
  });

  it("persists a visible understanding fail instead of swallowing it", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/fail-record" }, store, {
      understand: async () => {
        throw new Error("model down");
      },
    });

    const stored = await store.get(clip.id);
    expect(stored?.understanding).toMatchObject({
      status: "failed",
      message: "model down",
    });
    expect(stored?.understanding?.status === "failed" && stored.understanding.at).toEqual(
      expect.any(String),
    );
    expect(clip.understanding).toEqual(stored?.understanding);
  });

  it("writes the row before understanding runs", async () => {
    const store = memoryStore();
    let sawRow = false;
    await saveClip({ url: "https://example.com/order" }, store, {
      understand: async () => {
        sawRow = store.rows.size === 1;
        throw new Error("after persist");
      },
    });
    expect(sawRow).toBe(true);
  });

  it("persists an ok understanding after Keep", async () => {
    const store = memoryStore();
    const understood: Understanding = {
      contentType: "Notice",
      topic: "A harbour closure",
      entities: ["Mindelo"],
      date: "2026-09-01",
    };
    const clip = await saveClip({ url: "https://example.com/ok" }, store, {
      understand: async () => understood,
    });
    const stored = await store.get(clip.id);
    expect(stored?.understanding).toEqual({ status: "ok", ...understood });
  });

  it("persists through PGLite when understanding throws, with a fail record", async () => {
    const store = await clipStore();
    const clip = await saveClip({ url: "https://example.com/pglite" }, store, {
      understand: async () => {
        throw new Error("grok failed");
      },
    });
    const stored = await store.get(clip.id);
    expect(stored?.url).toBe("https://example.com/pglite");
    expect(stored?.understanding).toMatchObject({
      status: "failed",
      message: "grok failed",
    });
  });

  it("still keeps when default Grok understanding cannot run", async () => {
    const store = await clipStore();
    const clip = await saveClip({ url: "https://example.com/no-key" }, store);
    const stored = await store.get(clip.id);
    expect(stored?.url).toBe("https://example.com/no-key");
    expect(stored?.understanding).toMatchObject({
      status: "failed",
      message: "XAI_API_KEY is not set",
    });
  });

  it("does not roll back Keep when persist of the fail record fails", async () => {
    const store = memoryStore();
    store.persistUnderstanding = async () => {
      throw new Error("diagnostic write failed");
    };
    const clip = await saveClip({ url: "https://example.com/keep-stands" }, store, {
      understand: async () => {
        throw new Error("model down");
      },
    });
    expect(store.rows.has(clip.id)).toBe(true);
    expect(clip.understanding).toMatchObject({
      status: "failed",
      message: "model down",
    });
  });
});

describe("understanding fail is not an empty catch", () => {
  it("stores a readable fail record, not a silent omit", async () => {
    const records: UnderstandingRecord[] = [];
    const store = memoryStore();
    store.persistUnderstanding = async (id, record) => {
      records.push(record);
      const clip = store.rows.get(id);
      if (clip) store.rows.set(id, { ...clip, understanding: record });
    };

    await saveClip({ url: "https://example.com/visible" }, store, {
      understand: async () => {
        throw new Error("could not understand");
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "failed",
      message: "could not understand",
    });
    expect(store.rows.values().next().value?.understanding).toEqual(records[0]);
  });
});
