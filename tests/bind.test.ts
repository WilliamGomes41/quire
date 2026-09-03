import { afterEach, describe, expect, it } from "vitest";
import { composeIssue } from "../src/lib/compose";
import { createIssue, issueFromKeptWords, type BoundIssue, type IssueStore } from "../src/lib/bind";
import { openDb, resetMemoryDb } from "../src/lib/db";
import { saveClip, type Clip, type ClipStore } from "../src/lib/save";
import { relatedPersist } from "../src/lib/related";
import { clipStore, issueStore, listClips, takeBoundOffDesk } from "../src/lib/store";
import type { ArticleWords } from "../src/lib/article";

const quietHeadline = async () => ({ text: "" });

function memoryClips(): ClipStore & { rows: Map<string, Clip> } {
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

function memoryIssues(): IssueStore & { rows: Map<string, BoundIssue> } {
  const rows = new Map<string, BoundIssue>();
  return {
    rows,
    async insert(issue) {
      rows.set(issue.id, issue);
      return issue;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async remove(id) {
      rows.delete(id);
    },
  };
}

const originalWords: ArticleWords = {
  url: "https://example.com/kept",
  headline: "The harbour vote",
  paragraphs: [
    "The assembly met at dusk in Praia.",
    "The motion carried after a quiet count.",
  ],
};

const relatedWords: ArticleWords = {
  url: "https://news.example/one",
  headline: "A second dispatch",
  paragraphs: ["Another reporter stood on the quay."],
};

function fetchMap(map: Record<string, ArticleWords>) {
  return async (url: string) => {
    const words = map[url];
    if (!words) throw new Error(`no words for ${url}`);
    return words;
  };
}

describe("create issue binds a visible magazine page", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
  });

  it("includes the original by default and keeps related out until selected", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
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

    const issues = memoryIssues();
    const bound = await createIssue({ clip }, issues, {
      fetchWords: fetchMap({
        "https://example.com/kept": originalWords,
        "https://news.example/one": relatedWords,
      }),
      writeTake: async () => {
        throw new Error("no take");
      },
    });

    expect(bound.pieces.map((piece) => piece.url)).toEqual(["https://example.com/kept"]);
    expect(bound.pieces[0]?.role).toBe("original");
    expect(bound.pieces[0]?.paragraphs).toEqual(originalWords.paragraphs);

    const withRelated = await createIssue(
      { clip, choice: { includeOriginal: true, relatedUrls: ["https://news.example/one"] } },
      issues,
      {
        fetchWords: fetchMap({
          "https://example.com/kept": originalWords,
          "https://news.example/one": relatedWords,
        }),
        writeTake: async () => "A quiet count in Praia.",
      },
    );
    expect(withRelated.pieces.map((piece) => piece.url)).toEqual([
      "https://example.com/kept",
      "https://news.example/one",
    ]);
    expect(withRelated.pieces.filter((piece) => piece.url === "https://news.example/one")).toHaveLength(1);
  });

  it("puts the author's original words on Read, not the Keep understanding", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
      }),
      searchPages: async () => [],
    });
    const issue = await createIssue({ clip }, memoryIssues(), {
      fetchWords: async () => originalWords,
      writeTake: async () => "A take beside the piece.",
    });
    const page = composeIssue(issue);
    expect(page.lead.paragraphs).toEqual(originalWords.paragraphs);
    expect(page.lead.headline).toBe("The harbour vote");
    expect(page.lead.paragraphs.join(" ")).toMatch(/assembly met at dusk/);
    expect(page.lead.paragraphs.join(" ")).not.toBe("A harbour vote");
    expect(clip.understanding && clip.understanding.status === "ok" ? clip.understanding.topic : "").toBe(
      "A harbour vote",
    );
    expect(issue.pieces[0]?.coverLine).toBeUndefined();
    expect(page.cover.kicker).toBeUndefined();
    expect(JSON.stringify(page.cover)).not.toMatch(/A personal press/);
    expect(JSON.stringify(page.cover)).not.toMatch(/A harbour vote/);
    expect(JSON.stringify(page.cover)).not.toMatch(/A take beside the piece/);
    expect(page.contents.kicker).toBe("In this issue");
    expect(page.cover.masthead).toBe("Quire");
  });

  it("stays a valid page when the take is missing or failed", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "Notice",
        topic: "A harbour closure",
        entities: [],
      }),
      searchPages: async () => [],
    });
    const issue = await createIssue({ clip }, memoryIssues(), {
      fetchWords: async () => originalWords,
      writeTake: async () => {
        throw new Error("take down");
      },
    });
    expect(issue.take).toMatchObject({ status: "failed", message: "take down" });
    const page = composeIssue(issue);
    expect(page.take).toBeUndefined();
    expect(page.lead.paragraphs.length).toBeGreaterThan(0);
    expect(page.intent.take_slot).toBe("none");
  });

  it("keeps the clip when bind cannot fetch the author's words", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => {
        throw new Error("model down");
      },
      searchPages: async () => {
        throw new Error("search down");
      },
    });
    await expect(
      createIssue({ clip }, memoryIssues(), {
        fetchWords: async () => {
          throw new Error("fetch down");
        },
      }),
    ).rejects.toThrow(/author's words/);
    expect(clips.rows.get(clip.id)?.url).toBe("https://example.com/kept");
  });

  it("locks original words through PGLite and still keeps when take fails", async () => {
    const clips = await clipStore();
    const clip = await saveClip({ url: "https://example.com/pglite-bind" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "Comment",
        topic: "A column on reading",
        entities: [],
      }),
      searchPages: async () => [],
    });
    const issue = await createIssue({ clip }, await issueStore(), {
      fetchWords: async () => ({
        ...originalWords,
        url: clip.url,
      }),
      writeTake: async () => {
        throw new Error("take down");
      },
    });
    const stored = await (await issueStore()).get(issue.id);
    expect(stored?.pieces[0]?.paragraphs).toEqual(originalWords.paragraphs);
    expect(stored?.take).toMatchObject({ status: "failed" });
    await takeBoundOffDesk(issue.pieces.map((piece) => piece.url));
    expect(await clips.get(clip.id)).toBeNull();
    expect((await listClips()).map((row) => row.id)).not.toContain(clip.id);
  });

  it("round-trips a source-owned cover line already on the bound piece", async () => {
    const stored = await (
      await issueStore()
    ).insert({
      id: "issue-cover-line",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        {
          url: "https://example.com/kept",
          role: "original",
          headline: "The harbour vote",
          paragraphs: ["The assembly met at dusk in Praia."],
          coverLine: "Praia dispatch",
        },
      ],
    });
    const got = await (await issueStore()).get(stored.id);
    expect(got?.pieces[0]?.coverLine).toBe("Praia dispatch");
    const page = composeIssue(got!);
    expect(page.cover.kicker).toBe("Praia dispatch");
    expect(page.cover.kicker).not.toBe("A personal press");
    expect(page.contents.kicker).toBe("In this issue");
    expect(page.cover.masthead).toBe("Quire");
  });

  it("stays unfinished while fetchArticleWords is in flight", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
      }),
      searchPages: async () => [],
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    const work = createIssue({ clip }, memoryIssues(), {
      fetchWords: async () => {
        await gate;
        return originalWords;
      },
      writeTake: async () => {
        throw new Error("no take");
      },
    }).then((issue) => {
      finished = true;
      return issue;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    release();
    const issue = await work;
    expect(finished).toBe(true);
    expect(issue.pieces.map((piece) => piece.url)).toEqual(["https://example.com/kept"]);
  });

  it("still binds the original when a related fetch fails", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
      }),
      searchPages: async () => [{ url: "https://news.example/one", title: "Harbour vote in Praia" }],
    });
    const started: string[] = [];
    const issue = await createIssue(
      { clip, choice: { includeOriginal: true, relatedUrls: ["https://news.example/one"] } },
      memoryIssues(),
      {
        fetchWords: async (url) => {
          started.push(url);
          if (url === "https://news.example/one") {
            throw new Error("Could not fetch the author's words. (403)");
          }
          return originalWords;
        },
        writeTake: async () => {
          throw new Error("no take");
        },
      },
    );
    expect(started).toEqual(["https://example.com/kept", "https://news.example/one"]);
    expect(issue.pieces.map((piece) => piece.url)).toEqual(["https://example.com/kept"]);
    expect(issue.pieces[0]?.paragraphs).toEqual(originalWords.paragraphs);
    expect(clips.rows.has(clip.id)).toBe(true);
  });

  it("proves jsonb insert of U+0000 is the live unsupported Unicode escape sequence", async () => {
    await issueStore();
    const db = await openDb();
    await expect(
      db.query(
        "insert into issues (id, created_at, title, lead_url, take, pieces) values ($1, $2, $3, $4, $5, $6)",
        [
          "issue-nul-proof",
          "2026-09-01T00:00:00.000Z",
          "The harbour vote",
          "https://example.com/kept",
          { status: "ok", text: "A quiet count." },
          [
            {
              url: "https://example.com/kept",
              role: "original",
              headline: "The harbour vote",
              paragraphs: ["The assembly\u0000 met at dusk in Praia."],
            },
          ],
        ],
      ),
    ).rejects.toThrow(/unsupported Unicode escape sequence/);
    await expect(
      db.query(
        "insert into issues (id, created_at, title, lead_url, take, pieces) values ($1, $2, $3, $4, $5, $6)",
        [
          "issue-take-nul-proof",
          "2026-09-01T00:00:00.000Z",
          "The harbour vote",
          "https://example.com/kept",
          { status: "ok", text: "A quiet\u0000 count." },
          [
            {
              url: "https://example.com/kept",
              role: "original",
              headline: "The harbour vote",
              paragraphs: ["The assembly met at dusk in Praia."],
            },
          ],
        ],
      ),
    ).rejects.toThrow(/unsupported Unicode escape sequence/);
  });

  it("binds a paragraph with U+0000 or an unpaired surrogate instead of failing the store", async () => {
    const clips = await clipStore();
    const clip = await saveClip({ url: "https://example.com/nul-bind" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
      }),
      searchPages: async () => [],
    });
    const issue = await createIssue({ clip }, await issueStore(), {
      fetchWords: async () => ({
        url: clip.url,
        headline: "The harbour vote",
        paragraphs: [
          "The assembly\u0000 met at dusk in Praia.",
          "The motion\uD800 carried after a quiet count.",
        ],
      }),
      writeTake: async () => {
        throw new Error("take down");
      },
    });
    expect(issue.pieces[0]?.paragraphs).toEqual([
      "The assembly met at dusk in Praia.",
      "The motion carried after a quiet count.",
    ]);
    expect(JSON.stringify(issue.pieces)).not.toMatch(/\\u0000|\\ud800/i);
    expect(issue.take).toMatchObject({ status: "failed", message: "take down" });
    const stored = await (await issueStore()).get(issue.id);
    expect(stored?.pieces[0]?.paragraphs).toEqual(issue.pieces[0]?.paragraphs);
    expect(stored?.take).toMatchObject({ status: "failed" });
    expect(await clips.get(clip.id)).not.toBeNull();
  });

  it("does not fail the issue when the take itself contains U+0000", async () => {
    const clips = await clipStore();
    const clip = await saveClip({ url: "https://example.com/take-nul-bind" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
      }),
      searchPages: async () => [],
    });
    const issue = await createIssue({ clip }, await issueStore(), {
      fetchWords: async () => ({
        url: clip.url,
        headline: "The harbour vote",
        paragraphs: ["The assembly met at dusk in Praia."],
      }),
      writeTake: async () => "A quiet\u0000 count in Praia.",
    });
    expect(issue.pieces[0]?.paragraphs).toEqual(["The assembly met at dusk in Praia."]);
    expect(issue.take).toMatchObject({ status: "ok", text: "A quiet count in Praia." });
    expect(JSON.stringify(issue.take)).not.toMatch(/\\u0000/);
    const stored = await (await issueStore()).get(issue.id);
    expect(stored?.take).toMatchObject({ status: "ok", text: "A quiet count in Praia." });
    expect(stored?.pieces[0]?.paragraphs).toEqual(["The assembly met at dusk in Praia."]);
  });

  it("does not bind an empty selection", async () => {
    const clips = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, clips, {
      readHeadline: quietHeadline,
      understand: async () => ({
        contentType: "Notice",
        topic: "A harbour closure",
        entities: [],
      }),
      searchPages: async () => [],
    });
    await expect(
      createIssue(
        { clip, choice: { includeOriginal: false, relatedUrls: [] } },
        memoryIssues(),
        { fetchWords: async () => originalWords },
      ),
    ).rejects.toThrow(/Select something to bind/);
    expect(clips.rows.has(clip.id)).toBe(true);
  });

  it("reads an unbound keep as a magazine sheet without inserting an issue", () => {
    const keep: Clip = {
      id: "clip-keep",
      url: "https://example.com/kept",
      savedAt: "2026-09-01T00:00:00.000Z",
      understanding: null,
      relatedRail: { status: "ok" },
      relatedReporting: [{ url: "https://news.example/one", title: "Harbour vote in Praia" }],
      sourceHeadline: { status: "ok", text: "The harbour vote" },
    };
    const issues = memoryIssues();
    const sheet = issueFromKeptWords(keep, originalWords);
    expect(sheet.id).toBe("clip-keep");
    expect(sheet.take).toBeNull();
    expect(sheet.pieces).toEqual([
      {
        url: "https://example.com/kept",
        role: "original",
        headline: "The harbour vote",
        paragraphs: originalWords.paragraphs,
      },
    ]);
    const page = composeIssue(sheet);
    expect(page.lead.paragraphs).toEqual(originalWords.paragraphs);
    expect(page.sequence).toHaveLength(1);
    expect(issues.rows.size).toBe(0);
  });
});
