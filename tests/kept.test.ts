import { describe, expect, it } from "vitest";
import { hostnameOf, keptHeading, keptSnippet, paperBadgeLabel, relatedRow } from "../src/lib/kept";
import type { Clip } from "../src/lib/save";

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: "clip-1",
    url: "https://www.news.example/harbour",
    savedAt: "2026-09-01T00:00:00.000Z",
    understanding: null,
    relatedRail: null,
    relatedReporting: null,
    sourceHeadline: null,
    ...over,
  };
}

describe("kept card heading", () => {
  it("uses the stored source headline when Keep persisted one", () => {
    const kept = clip({
      sourceHeadline: { status: "ok", text: "The harbour vote", snippet: "The assembly met at dusk." },
      understanding: {
        status: "ok",
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
      },
    });
    expect(keptHeading(kept)).toBe("The harbour vote");
    expect(keptHeading(kept)).not.toBe(kept.url);
    expect(keptHeading(kept)).not.toBe("A harbour vote");
    expect(keptSnippet(kept.sourceHeadline)).toBe("The assembly met at dusk.");
  });

  it("falls back to host and stored topic when there is no author headline", () => {
    expect(hostnameOf("https://www.news.example/harbour")).toBe("news.example");
    expect(keptHeading(clip())).toBe("news.example");
    expect(keptHeading(clip())).not.toBe("https://www.news.example/harbour");

    const understood = clip({
      understanding: {
        status: "ok",
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
        date: "2026-09-01",
      },
    });
    expect(keptHeading(understood)).toBe("news.example · A harbour vote");
    expect(keptHeading(understood)).not.toBe(understood.url);
  });

  it("does not use the URL when headline or understanding failed", () => {
    const failed = clip({
      sourceHeadline: { status: "failed", message: "fetch down", at: "2026-09-01T00:00:00.000Z" },
      understanding: { status: "failed", message: "model down", at: "2026-09-01T00:00:00.000Z" },
    });
    expect(keptHeading(failed)).toBe("news.example");
    expect(keptHeading(failed)).not.toBe("https://www.news.example/harbour");
    expect(keptSnippet(failed.sourceHeadline)).toBe("");
  });
});

describe("paper badge from stored understanding", () => {
  it("labels News, Comment, Study, or Notice only when status is ok", () => {
    expect(
      paperBadgeLabel({
        status: "ok",
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
      }),
    ).toBe("News");
    expect(
      paperBadgeLabel({
        status: "ok",
        contentType: "Comment",
        topic: "A column on reading",
        entities: [],
      }),
    ).toBe("Comment");
    expect(
      paperBadgeLabel({
        status: "ok",
        contentType: "Study",
        topic: "A paper",
        entities: [],
      }),
    ).toBe("Study");
    expect(
      paperBadgeLabel({
        status: "ok",
        contentType: "Notice",
        topic: "A harbour closure",
        entities: [],
      }),
    ).toBe("Notice");
  });

  it("has no badge when understanding is missing or failed", () => {
    expect(paperBadgeLabel(null)).toBeNull();
    expect(paperBadgeLabel(undefined)).toBeNull();
    expect(
      paperBadgeLabel({ status: "failed", message: "model down", at: "2026-09-01T00:00:00.000Z" }),
    ).toBeNull();
  });
});

describe("related row is readable without leaving Select", () => {
  it("shows the stored snippet and host under the title", () => {
    expect(
      relatedRow({
        url: "https://www.bbc.co.uk/iplayer",
        title: "BBC News Commercial",
        snippet: "Watch live and catch up on BBC programmes.",
      }),
    ).toEqual({
      title: "BBC News Commercial",
      host: "bbc.co.uk",
      snippet: "Watch live and catch up on BBC programmes.",
      detail: "",
    });
  });

  it("falls back to the url as title when none is stored", () => {
    expect(relatedRow({ url: "https://news.example/one" })).toEqual({
      title: "https://news.example/one",
      host: "news.example",
      snippet: "",
      detail: "news.example",
    });
  });
});
