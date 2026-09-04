import { describe, expect, it } from "vitest";
import {
  couldNotLook,
  moreOnThisTopic,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
} from "../src/copy";
import {
  RELATED_REPORTING_MAX,
  buildSearchQuery,
  dedupeRelated,
  dropZeroOverlap,
  normalizeRelated,
  rankRelated,
  relatedPersist,
  runRelatedReporting,
} from "../src/lib/related";
import { pagesFromSearchApi, resolveSearchPages, searchApis } from "../src/lib/search";

describe("related_reporting max five", () => {
  it("persists at most five ranked pages after normalize and dedupe", async () => {
    const raw = Array.from({ length: 8 }, (_, index) => ({
      url: `https://news.example/harbour-${index}`,
      title: `Harbour vote ${index}`,
      snippet: "Praia harbour vote reporting",
    }));
    const record = await runRelatedReporting({
      url: "https://example.com/kept",
      topic: { contentType: "News", topic: "A harbour vote", entities: ["Praia"] },
      searchPages: async () => raw,
    });

    expect(record.status).toBe("ok");
    if (record.status !== "ok") return;
    expect(record.related_reporting).toHaveLength(RELATED_REPORTING_MAX);
    expect(RELATED_REPORTING_MAX).toBe(5);
    expect(relatedPersist(record).related_reporting).toHaveLength(5);
  });
});

describe("ok+0 empty copy vs system-fail copy", () => {
  it("uses the empty-topic sentence only for successful retrieval with zero pages", async () => {
    const empty = await runRelatedReporting({
      url: "https://example.com/kept",
      topic: { contentType: "Notice", topic: "A harbour closure", entities: [] },
      searchPages: async () => [],
    });
    expect(empty).toEqual({ status: "ok", related_reporting: [] });
    expect(relatedPersist(empty).related_reporting).toEqual([]);

    const emptyCopy = moreOnThisTopicCopy({ status: "ok", count: 0 });
    expect(emptyCopy).toEqual({ kind: "empty", text: nothingMoreOnTopic });
    expect(emptyCopy.text).toMatch(/nothing more on this topic/i);
    expect(emptyCopy.text).not.toMatch(/could not look/i);

    for (const status of ["failed", "unconfigured", "timeout"] as const) {
      const failCopy = moreOnThisTopicCopy({ status, count: 0 });
      expect(failCopy).toEqual({ kind: "fail", text: couldNotLook });
      expect(failCopy.text).not.toBe(nothingMoreOnTopic);
      expect(failCopy.text).not.toMatch(/nothing more on this topic/i);
      expect(failCopy.text).toMatch(/could not look/i);
    }

    expect(moreOnThisTopicCopy({ status: "ok", count: 2 }).text).toBe(moreOnThisTopic);
  });
});

describe("failed does not write related_reporting", () => {
  it("keeps related_reporting off the persist payload when retrieval fails", async () => {
    const failed = await runRelatedReporting({
      url: "https://example.com/kept",
      topic: { contentType: "News", topic: "A harbour vote", entities: [] },
      searchPages: async () => {
        throw Object.assign(new Error("provider down"), { status: "failed" });
      },
    });
    expect(failed.status).toBe("failed");
    expect(failed).not.toHaveProperty("related_reporting");

    const write = relatedPersist(failed);
    expect(write.related_rail.status).toBe("failed");
    expect(write).not.toHaveProperty("related_reporting");
  });

  it("does not collapse unconfigured or timeout into ok+0", async () => {
    const unconfigured = await runRelatedReporting({
      url: "https://example.com/kept",
      searchPages: async () => {
        throw Object.assign(new Error("SEARCH_API_KEY is not set"), { status: "unconfigured" });
      },
    });
    const timeout = await runRelatedReporting({
      url: "https://example.com/kept",
      searchPages: async () => {
        throw Object.assign(new Error("aborted"), { name: "TimeoutError", status: "timeout" });
      },
    });

    expect(unconfigured.status).toBe("unconfigured");
    expect(timeout.status).toBe("timeout");
    expect(relatedPersist(unconfigured)).not.toHaveProperty("related_reporting");
    expect(relatedPersist(timeout)).not.toHaveProperty("related_reporting");
    expect(unconfigured.status === "ok" ? unconfigured.related_reporting : undefined).toBeUndefined();
  });
});

describe("provider slot", () => {
  it("is a function/config registry, not a class per vendor", () => {
    expect(typeof resolveSearchPages).toBe("function");
    expect(typeof pagesFromSearchApi).toBe("function");
    expect(Object.keys(searchApis)).toEqual(["search_api"]);
    expect(searchApis.search_api).toBe(pagesFromSearchApi);
  });

  it("lets the app own query, normalize, dedupe, and rank", () => {
    expect(
      buildSearchQuery({
        url: "https://example.com/kept",
        topic: { contentType: "News", topic: "A harbour vote", entities: ["Praia"], date: "2026-09-01" },
      }),
    ).toBe("A harbour vote Praia 2026-09-01");

    const normalized = normalizeRelated(
      [
        { url: "https://WWW.News.example/story/#top", title: "Story" },
        { url: "https://example.com/kept", title: "The keep" },
        { url: "not-a-url", title: "Bad" },
      ],
      "https://example.com/kept",
    );
    expect(normalized).toEqual([{ url: "https://news.example/story", title: "Story" }]);
    expect(
      normalizeRelated(
        [{ url: "https://news.example/follow", title: "Follow-up", date: "2026-09-01" }],
        "https://example.com/kept",
      ),
    ).toEqual([{ url: "https://news.example/follow", title: "Follow-up", date: "2026-09-01" }]);
    expect(
      normalizeRelated(
        [{ url: "https://news.example/tagged", title: "<b>Harbour</b>", snippet: "A <em>note</em>." }],
        "https://example.com/kept",
      ),
    ).toEqual([{ url: "https://news.example/tagged", title: "Harbour", snippet: "A note." }]);

    const deduped = dedupeRelated([
      { url: "https://news.example/a", title: "One" },
      { url: "https://news.example/a", title: "Dup" },
    ]);
    expect(deduped).toHaveLength(1);

    const ranked = rankRelated(
      [
        { url: "https://other.example/x", title: "Unrelated weather" },
        { url: "https://news.example/harbour", title: "Harbour vote in Praia" },
      ],
      { contentType: "News", topic: "A harbour vote", entities: ["Praia"] },
    );
    expect(ranked[0]?.url).toBe("https://news.example/harbour");
    expect(ranked.map((page) => page.url)).toContain("https://other.example/x");
  });
});

describe("query hygiene: keep-host author tokens stay out", () => {
  it("does not feed williamgomes from a Substack host and prefers topic", () => {
    const query = buildSearchQuery({
      url: "https://williamgomes1.substack.com/p/over-intelligentie",
      topic: {
        contentType: "Comment",
        topic: "Over intelligentie",
        entities: ["William Gomes"],
        date: "2026-09-01",
      },
    });
    expect(query).toBe("Over intelligentie 2026-09-01");
    expect(query.toLowerCase()).not.toMatch(/williamgomes/);
    expect(query).not.toMatch(/William Gomes/);
    expect(query).not.toMatch(/substack/i);
    expect(query).not.toBe("https://williamgomes1.substack.com/p/over-intelligentie");
  });

  it("keeps remaining entities that are not the keep-host author", () => {
    expect(
      buildSearchQuery({
        url: "https://williamgomes1.substack.com/p/harbour",
        topic: {
          contentType: "News",
          topic: "A harbour vote",
          entities: ["William Gomes", "Praia"],
          date: "2026-09-01",
        },
      }),
    ).toBe("A harbour vote Praia 2026-09-01");
  });

  it("falls back without stuffing the keep-host when topic is empty", () => {
    const pathOnly = buildSearchQuery({
      url: "https://williamgomes1.substack.com/p/over-intelligentie",
    });
    expect(pathOnly.toLowerCase()).toBe("over intelligentie");
    expect(pathOnly.toLowerCase()).not.toMatch(/williamgomes/);
    expect(pathOnly).not.toMatch(/williamgomes1\.substack/);

    const hostOnly = buildSearchQuery({
      url: "https://williamgomes1.substack.com/",
    });
    expect(hostOnly).toBe("");
    expect(hostOnly.toLowerCase()).not.toMatch(/williamgomes/);
  });

  it("does not search the keep host when there is nothing on-topic to score", async () => {
    const queries: string[] = [];
    const empty = await runRelatedReporting({
      url: "https://williamgomes1.substack.com/p/over-intelligentie",
      searchPages: async ({ query }) => {
        queries.push(query);
        return [{ url: "https://en.wikipedia.org/wiki/William_Gomes", title: "William Gomes footballer" }];
      },
    });
    expect(empty).toEqual({ status: "ok", related_reporting: [] });
    expect(empty.status).not.toBe("failed");
    expect(queries).toEqual([]);
    expect(moreOnThisTopicCopy({ status: "ok", count: 0 }).kind).toBe("empty");
  });
});

describe("zero-overlap pages drop after rank", () => {
  it("drops pages with no token overlap and keeps the cap at five", async () => {
    const overlapping = Array.from({ length: 6 }, (_, index) => ({
      url: `https://news.example/harbour-${index}`,
      title: `Harbour vote ${index}`,
      snippet: "Praia harbour vote reporting",
    }));
    const junk = [
      { url: "https://en.wikipedia.org/wiki/William_Gomes", title: "William Gomes footballer" },
      { url: "https://www.dbnl.org/tekst/oltmans", title: "Oltmans", snippet: "DBNL catalogus" },
    ];
    const record = await runRelatedReporting({
      url: "https://williamgomes1.substack.com/p/harbour",
      topic: { contentType: "News", topic: "A harbour vote", entities: ["William Gomes", "Praia"] },
      searchPages: async () => [...junk, ...overlapping],
    });

    expect(record.status).toBe("ok");
    if (record.status !== "ok") return;
    expect(record.related_reporting).toHaveLength(RELATED_REPORTING_MAX);
    expect(RELATED_REPORTING_MAX).toBe(5);
    expect(record.related_reporting.every((page) => /harbour/i.test(page.title ?? ""))).toBe(true);
    expect(record.related_reporting.map((page) => page.url)).not.toContain(
      "https://en.wikipedia.org/wiki/William_Gomes",
    );
    expect(record.related_reporting.map((page) => page.url)).not.toContain(
      "https://www.dbnl.org/tekst/oltmans",
    );
  });

  it("treats all-junk after filter as ok+0, not fail", async () => {
    const empty = await runRelatedReporting({
      url: "https://williamgomes1.substack.com/p/over-intelligentie",
      topic: { contentType: "Comment", topic: "Over intelligentie", entities: ["William Gomes"] },
      searchPages: async () => [
        { url: "https://en.wikipedia.org/wiki/William_Gomes", title: "William Gomes footballer" },
        { url: "https://www.dbnl.org/tekst/oltmans", title: "Oltmans", snippet: "DBNL catalogus" },
      ],
    });

    expect(empty).toEqual({ status: "ok", related_reporting: [] });
    expect(relatedPersist(empty).related_reporting).toEqual([]);
    expect(empty.status).not.toBe("failed");

    const emptyCopy = moreOnThisTopicCopy({ status: "ok", count: 0 });
    expect(emptyCopy).toEqual({ kind: "empty", text: nothingMoreOnTopic });
    expect(emptyCopy.text).not.toMatch(/could not look/i);

    const ranked = rankRelated(
      [
        { url: "https://en.wikipedia.org/wiki/William_Gomes", title: "William Gomes footballer" },
        { url: "https://news.example/reading", title: "Over intelligentie" },
      ],
      { contentType: "Comment", topic: "Over intelligentie", entities: ["William Gomes"] },
    );
    expect(ranked).toHaveLength(2);
    expect(
      dropZeroOverlap(ranked, { contentType: "Comment", topic: "Over intelligentie", entities: ["William Gomes"] }, "https://williamgomes1.substack.com/p/note"),
    ).toEqual([{ url: "https://news.example/reading", title: "Over intelligentie" }]);
  });

  it("still excludes the keep URL and strips tags", async () => {
    const record = await runRelatedReporting({
      url: "https://williamgomes1.substack.com/p/harbour",
      topic: { contentType: "News", topic: "A harbour vote", entities: ["Praia"] },
      searchPages: async () => [
        { url: "https://williamgomes1.substack.com/p/harbour", title: "The keep" },
        { url: "https://news.example/tagged", title: "<b>Harbour</b> vote", snippet: "A <em>Praia</em> note." },
      ],
    });
    expect(record).toEqual({
      status: "ok",
      related_reporting: [
        { url: "https://news.example/tagged", title: "Harbour vote", snippet: "A Praia note." },
      ],
    });
  });
});

describe("related rail stays a search slot, not Grok web_search", () => {
  it("does not add web_search or a /press path", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const related = readFileSync("src/lib/related.ts", "utf8");
    const understanding = readFileSync("src/lib/understanding.ts", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    expect(related).not.toMatch(/web_search/);
    expect(understanding).toMatch(/must not call web_search/);
    expect(existsSync("src/routes/press.tsx")).toBe(false);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
  });
});
