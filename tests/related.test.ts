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
  });
});
