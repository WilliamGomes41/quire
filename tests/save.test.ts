import { afterEach, describe, expect, it } from "vitest";
import { resetMemoryDb } from "../src/lib/db";
import { relatedPersist, type RelatedRailRecord } from "../src/lib/related";
import { saveClip, type Clip, type ClipStore } from "../src/lib/save";
import { clipStore, listClips } from "../src/lib/store";
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
    async persistRelated(id, record) {
      const clip = rows.get(id);
      if (!clip) throw new Error("missing clip");
      const write = relatedPersist(record);
      rows.set(id, {
        ...clip,
        relatedRail: write.related_rail,
        ...("related_reporting" in write ? { relatedReporting: write.related_reporting ?? null } : {}),
      });
    },
    async persistSourceHeadline(id, record) {
      const clip = rows.get(id);
      if (!clip) throw new Error("missing clip");
      rows.set(id, { ...clip, sourceHeadline: record });
    },
    async remove(id) {
      rows.delete(id);
    },
  };
}

const quietSearch = async () => [];
const quietHeadline = async () => ({ text: "" });

describe("Keep is not bind", () => {
  it("does not call bind or read from the Keep path", async () => {
    const { readFileSync } = await import("node:fs");
    const save = readFileSync("src/lib/save.ts", "utf8");
    expect(save).not.toMatch(/createIssue|composeIssue|runGrokTake|fetchArticleWords/);
  });

  it("attempts to persist a source headline from the fetch", async () => {
    const { readFileSync } = await import("node:fs");
    const save = readFileSync("src/lib/save.ts", "utf8");
    expect(save).toMatch(/persistSourceHeadline/);
    expect(save).toMatch(/runSourceHeadline/);
    expect(save).not.toMatch(/web_search/);
  });
});

describe("Keep always saves", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
    delete process.env.SEARCH_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  it("persists the clip when understanding throws", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/kept" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });

    expect(clip.url).toBe("https://example.com/kept");
    expect(store.rows.get(clip.id)?.url).toBe("https://example.com/kept");
  });

  it("persists a visible understanding fail instead of swallowing it", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/fail-record" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
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
      readHeadline: quietHeadline,
      understand: async () => {
        sawRow = store.rows.size === 1;
        throw new Error("after persist");
      },
      searchPages: quietSearch,
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
      readHeadline: quietHeadline,
      understand: async () => understood,
      searchPages: quietSearch,
    });
    const stored = await store.get(clip.id);
    expect(stored?.understanding).toEqual({ status: "ok", ...understood });
  });

  it("persists through PGLite when understanding throws, with a fail record", async () => {
    const store = await clipStore();
    const clip = await saveClip({ url: "https://example.com/pglite" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("grok failed");
      },
      searchPages: quietSearch,
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
    const clip = await saveClip({ url: "https://example.com/no-key" }, store, {
      readHeadline: quietHeadline,
      searchPages: quietSearch,
    });
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
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
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
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("could not understand");
      },
      searchPages: quietSearch,
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "failed",
      message: "could not understand",
    });
    expect(store.rows.values().next().value?.understanding).toEqual(records[0]);
  });
});

describe("Keep still persists when search throws", () => {
  it("writes the clip and a rail fail, not related_reporting", async () => {
    const store = memoryStore();
    const clip = await saveClip({ url: "https://example.com/search-throws" }, store, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
      }),
      searchPages: async () => {
        throw new Error("search down");
      },
    });

    expect(store.rows.get(clip.id)?.url).toBe("https://example.com/search-throws");
    expect(clip.url).toBe("https://example.com/search-throws");
    const stored = await store.get(clip.id);
    expect(stored?.relatedRail).toMatchObject({
      status: "failed",
      message: "search down",
    });
    expect(stored?.relatedReporting).toBeNull();
    expect(stored).not.toMatchObject({ relatedReporting: expect.any(Array) });
  });

  it("does not write related_reporting on PGLite when search throws", async () => {
    const store = await clipStore();
    const clip = await saveClip({ url: "https://example.com/pglite-search" }, store, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "Comment",
        topic: "A column on reading",
        entities: [],
      }),
      searchPages: async () => {
        throw new Error("search down");
      },
    });
    const stored = await store.get(clip.id);
    expect(stored?.url).toBe("https://example.com/pglite-search");
    expect(stored?.relatedRail?.status).toBe("failed");
    expect(stored?.relatedReporting).toBeNull();
  });

  it("still keeps when persist of the rail fail throws", async () => {
    const store = memoryStore();
    store.persistRelated = async () => {
      throw new Error("rail write failed");
    };
    const clip = await saveClip({ url: "https://example.com/rail-write" }, store, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "Study",
        topic: "A paper",
        entities: [],
      }),
      searchPages: async () => {
        throw new Error("search down");
      },
    });
    expect(store.rows.has(clip.id)).toBe(true);
    expect(clip.relatedRail).toMatchObject({
      status: "failed",
      message: "search down",
    });
  });
});

describe("successful retrieval writes related_reporting", () => {
  it("persists ok pages and ok+0 distinctly from fail", async () => {
    const store = memoryStore();
    const withPages = await saveClip({ url: "https://example.com/with-pages" }, store, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
      }),
      searchPages: async () => [
        { url: "https://news.example/one", title: "Harbour vote in Praia" },
        { url: "https://news.example/two", title: "Harbour vote follow-up" },
      ],
    });
    expect(withPages.relatedRail).toEqual({ status: "ok" });
    expect(withPages.relatedReporting).toHaveLength(2);

    const empty = await saveClip({ url: "https://example.com/empty-topic" }, store, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "Notice",
        topic: "A harbour closure",
        entities: [],
      }),
      searchPages: async () => [],
    });
    expect(empty.relatedRail).toEqual({ status: "ok" });
    expect(empty.relatedReporting).toEqual([]);

    const rails: RelatedRailRecord[] = [];
    store.persistRelated = async (id, record) => {
      rails.push(record);
      const clip = store.rows.get(id);
      if (!clip) return;
      const write = relatedPersist(record);
      store.rows.set(id, {
        ...clip,
        relatedRail: write.related_rail,
        ...("related_reporting" in write ? { relatedReporting: write.related_reporting ?? null } : {}),
      });
    };
    await saveClip({ url: "https://example.com/fail-write" }, store, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
      }),
      searchPages: async () => {
        throw Object.assign(new Error("provider down"), { status: "failed" });
      },
    });
    expect(rails[0]).not.toHaveProperty("related_reporting");
  });
});

describe("remove takes the clip off the pile", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
    delete process.env.SEARCH_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  it("drops the clip from listClips and still lets Keep save", async () => {
    const store = await clipStore();
    const first = await saveClip({ url: "https://example.com/first" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    const second = await saveClip({ url: "https://example.com/second" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });

    await store.remove(first.id);

    const afterRemove = await listClips();
    expect(afterRemove.map((clip) => clip.id)).not.toContain(first.id);
    expect(afterRemove.map((clip) => clip.id)).toContain(second.id);
    expect(await store.get(first.id)).toBeNull();

    const third = await saveClip({ url: "https://example.com/third" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    const listed = await listClips();
    expect(listed.map((clip) => clip.id)).toContain(second.id);
    expect(listed.map((clip) => clip.id)).toContain(third.id);
    expect(listed.map((clip) => clip.id)).not.toContain(first.id);
    expect(listed.map((clip) => clip.url)).toEqual(
      expect.arrayContaining(["https://example.com/second", "https://example.com/third"]),
    );
  });

  it("is persist-safe when the id is already gone", async () => {
    const store = await clipStore();
    await expect(store.remove("missing-clip")).resolves.toBeUndefined();
    await expect(store.remove("")).resolves.toBeUndefined();
    const kept = await saveClip({ url: "https://example.com/after-missing" }, store, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    expect((await listClips()).map((clip) => clip.id)).toContain(kept.id);
  });

  it("deletes only the clips row", async () => {
    const { readFileSync } = await import("node:fs");
    const store = readFileSync("src/lib/store.ts", "utf8");
    const clipRemove = store.match(
      /async remove\(id\) \{\s*if \(!id\) return;\s*await db\.query\("delete from clips where id = \$1"/,
    );
    expect(clipRemove).toBeTruthy();
    expect(store).not.toMatch(/cascade/i);
  });
});

describe("Keep persists a source headline fail-closed", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
    delete process.env.SEARCH_API_KEY;
  });

  it("stores og:title when the fetch has one, and still keeps when it cannot", async () => {
    const store = memoryStore();
    const withTitle = await saveClip({ url: "https://example.com/headline" }, store, {
      readHeadline: async () => ({
        text: "The harbour vote",
        snippet: "The assembly met at dusk in Praia.",
        figure: "https://news.example/harbour.jpg",
      }),
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    expect(withTitle.sourceHeadline).toEqual({
      status: "ok",
      text: "The harbour vote",
      snippet: "The assembly met at dusk in Praia.",
      figure: "https://news.example/harbour.jpg",
    });
    expect(store.rows.get(withTitle.id)?.url).toBe("https://example.com/headline");

    const empty = await saveClip({ url: "https://example.com/no-title" }, store, {
      readHeadline: async () => ({ text: "" }),
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    expect(empty.sourceHeadline).toEqual({ status: "empty" });
    expect(empty.sourceHeadline?.status).not.toBe("failed");

    const failed = await saveClip({ url: "https://example.com/headline-fail" }, store, {
      readHeadline: async () => {
        throw new Error("fetch down");
      },
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    expect(failed.sourceHeadline).toMatchObject({
      status: "failed",
      message: "fetch down",
    });
    expect(failed.sourceHeadline?.status).not.toBe("empty");
    expect(store.rows.has(failed.id)).toBe(true);
  });

  it("still keeps a 403 headline fail and does not invent a title", async () => {
    const { couldNotReadHeadline, sourceHeadlineCopy } = await import("../src/copy");
    const store = memoryStore();
    const failed = await saveClip({ url: "https://example.com/headline-403" }, store, {
      readHeadline: async () => {
        throw new Error(`${couldNotReadHeadline} (403)`);
      },
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    expect(store.rows.has(failed.id)).toBe(true);
    expect(failed.url).toBe("https://example.com/headline-403");
    expect(failed.sourceHeadline).toMatchObject({
      status: "failed",
      message: `${couldNotReadHeadline} (403)`,
    });
    expect(failed.sourceHeadline?.status).not.toBe("empty");
    expect(failed.sourceHeadline).not.toMatchObject({ status: "ok", text: expect.anything() });
    const spoken = sourceHeadlineCopy(failed.sourceHeadline!);
    expect(spoken.kind).toBe("fail");
    expect(spoken.text).toBe(`${couldNotReadHeadline} (403)`);
    expect(spoken.text.match(/Could not read a headline from the source\./g)).toHaveLength(1);
  });

  it("does not roll back Keep when persist of the headline fail throws", async () => {
    const store = memoryStore();
    store.persistSourceHeadline = async () => {
      throw new Error("headline write failed");
    };
    const clip = await saveClip({ url: "https://example.com/headline-write" }, store, {
      readHeadline: async () => {
        throw new Error("fetch down");
      },
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: quietSearch,
    });
    expect(store.rows.has(clip.id)).toBe(true);
    expect(clip.sourceHeadline).toMatchObject({
      status: "failed",
      message: "fetch down",
    });
  });

  it("persists ok, empty, and fail through PGLite without blocking Keep", async () => {
    const store = await clipStore();
    const ok = await saveClip({ url: "https://example.com/pglite-headline" }, store, {
      readHeadline: async () => ({ text: "The harbour vote" }),
      understand: async () => {
        throw new Error("grok failed");
      },
      searchPages: quietSearch,
    });
    expect((await store.get(ok.id))?.sourceHeadline).toEqual({
      status: "ok",
      text: "The harbour vote",
    });

    const empty = await saveClip({ url: "https://example.com/pglite-empty-headline" }, store, {
      readHeadline: async () => ({ text: "" }),
      understand: async () => {
        throw new Error("grok failed");
      },
      searchPages: quietSearch,
    });
    expect((await store.get(empty.id))?.sourceHeadline).toEqual({ status: "empty" });
  });
});
