import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keepNeedsUrl } from "../src/copy";
import { deskEnriching, KEEP_STALE_MS, keepProgress } from "../src/lib/kept";
import { relatedPersist } from "../src/lib/related";
import { enrichClip, keepClip, type Clip, type ClipStore } from "../src/lib/save";

function memoryStore(): ClipStore & { rows: Map<string, Clip>; seen: Clip[] } {
  const rows = new Map<string, Clip>();
  const seen: Clip[] = [];
  const put = (clip: Clip) => {
    rows.set(clip.id, clip);
    seen.push(clip);
  };
  const at = (id: string) => {
    const clip = rows.get(id);
    if (!clip) throw new Error("missing clip");
    return clip;
  };
  return {
    rows,
    seen,
    async insert(clip) {
      put(clip);
      return clip;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async persistSourceHeadline(id, record) {
      put({ ...at(id), sourceHeadline: record });
    },
    async persistUnderstanding(id, record) {
      put({ ...at(id), understanding: record });
    },
    async persistRelated(id, record) {
      const write = relatedPersist(record);
      put({ ...at(id), relatedRail: write.related_rail, relatedReporting: write.related_reporting ?? null });
    },
    async remove(id) {
      rows.delete(id);
    },
  };
}

const clipAt = (savedAt: string, fields: Partial<Clip> = {}): Clip => ({
  id: "c1",
  url: "https://example.com/a",
  savedAt,
  understanding: null,
  relatedRail: null,
  relatedReporting: null,
  sourceHeadline: null,
  ...fields,
});

describe("Keep answers before reading", () => {
  it("persists the clip without fetching or calling a model", async () => {
    const store = memoryStore();
    const clip = await keepClip({ url: " https://example.com/a " }, store);
    expect(clip.url).toBe("https://example.com/a");
    expect(store.rows.get(clip.id)).toEqual(clip);
    expect(keepProgress(clip)).toBe("reading");
  });

  it("still refuses a non-public URL before storing", async () => {
    const store = memoryStore();
    await expect(keepClip({ url: "http://192.168.1.10/x" }, store)).rejects.toThrow(keepNeedsUrl);
    expect(store.rows.size).toBe(0);
  });

  it("fills the card in step by step and writes the rail last", async () => {
    const store = memoryStore();
    const clip = await keepClip({ url: "https://example.com/a" }, store);
    const done = await enrichClip(clip, store, {
      readHeadline: async () => ({ text: "The harbour vote" }),
      understand: async () => {
        throw new Error("no key");
      },
      searchPages: async () => [],
    });
    const steps = store.seen.map((row) => keepProgress(row));
    expect(steps).toEqual(["reading", "understanding", "related", null]);
    expect(done.relatedRail).not.toBeNull();
  });

  it("answers the desk without waiting for enrichment", () => {
    const desk = readFileSync("src/routes/index.tsx", "utf8");
    expect(desk).toMatch(/await keepClip\(/);
    expect(desk).toMatch(/afterResponse\(\s*enrichClip\(/);
    expect(desk).not.toMatch(/await saveClip\(|await enrichClip\(/);
    expect(desk).toMatch(/router\.invalidate\(\), 2000/);
  });
});

describe("kept card progress", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const fresh = new Date(now - 10_000).toISOString();
  const old = new Date(now - KEEP_STALE_MS - 1).toISOString();
  const headline = { status: "ok" as const, text: "x", at: fresh };

  it("names the step a fresh card is on", () => {
    expect(keepProgress(clipAt(fresh), now)).toBe("reading");
    expect(keepProgress(clipAt(fresh, { sourceHeadline: headline }), now)).toBe("understanding");
    expect(
      keepProgress(
        clipAt(fresh, { sourceHeadline: headline, understanding: { status: "failed", message: "x", at: fresh } }),
        now,
      ),
    ).toBe("related");
  });

  it("is done once the rail landed, however old", () => {
    expect(keepProgress(clipAt(old, { relatedRail: { status: "ok" } }), now)).toBeNull();
  });

  it("calls an unfinished card stalled after a while and stops polling for it", () => {
    expect(keepProgress(clipAt(old), now)).toBe("stalled");
    expect(deskEnriching([clipAt(old)], now)).toBe(false);
    expect(deskEnriching([clipAt(old), clipAt(fresh)], now)).toBe(true);
    expect(deskEnriching([clipAt(fresh, { relatedRail: { status: "ok" } })], now)).toBe(false);
  });
});
