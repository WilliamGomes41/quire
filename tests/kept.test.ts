import { describe, expect, it } from "vitest";
import { hostnameOf, keptFigure, keptHeading, keptSnippet, paperBadgeLabel, relatedCollapsed, relatedCountLabel, relatedRow, relatedVisible } from "../src/lib/kept";
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
    expect(keptFigure(kept.sourceHeadline)).toBe("");
  });

  it("surfaces a stored figure and never invents one", () => {
    const pictured = clip({
      sourceHeadline: {
        status: "ok",
        text: "The harbour vote",
        figure: "https://news.example/harbour.jpg",
      },
    });
    expect(keptFigure(pictured.sourceHeadline)).toBe("https://news.example/harbour.jpg");
    expect(keptFigure(clip().sourceHeadline)).toBe("");
    expect(
      keptFigure({ status: "failed", message: "fetch down", at: "2026-09-01T00:00:00.000Z" }),
    ).toBe("");
  });

  it("falls back to stored topic without a host prefix when there is no author headline", () => {
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
    expect(keptHeading(understood)).toBe("A harbour vote");
    expect(keptHeading(understood)).not.toMatch(/news\.example/);
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
  it("maps stored Comment to Opinion; News, Study, and Notice stay", () => {
    expect(
      paperBadgeLabel({
        status: "ok",
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
      }),
    ).toBe("News");
    const comment = {
      status: "ok" as const,
      contentType: "Comment" as const,
      topic: "A column on reading",
      entities: [],
    };
    expect(paperBadgeLabel(comment)).toBe("Opinion");
    expect(paperBadgeLabel(comment)).not.toBe("Comment");
    expect(comment.contentType).toBe("Comment");
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

  it("strips tags from related title and snippet", () => {
    expect(
      relatedRow({
        url: "https://news.example/one",
        title: "<b>Harbour vote</b>",
        snippet: "Watch <em>live</em> and catch up.",
      }),
    ).toEqual({
      title: "Harbour vote",
      host: "news.example",
      snippet: "Watch live and catch up.",
      detail: "",
    });
  });

  it("falls back to publisher · date when there is no snippet, and does not invent a dek", () => {
    expect(relatedRow({ url: "https://news.example/one" })).toEqual({
      title: "https://news.example/one",
      host: "news.example",
      snippet: "",
      detail: "news.example",
    });
    expect(
      relatedRow({
        url: "https://news.example/two",
        title: "Harbour vote follow-up",
        date: "2026-09-01",
      }),
    ).toEqual({
      title: "Harbour vote follow-up",
      host: "news.example",
      snippet: "",
      detail: "news.example · 2026-09-01",
    });
  });
});

describe("related roll in and out", () => {
  it("keeps selected related visible and unselected in the collapsed set", () => {
    const pages = [
      { url: "https://news.example/one", title: "One" },
      { url: "https://news.example/two", title: "Two" },
      { url: "https://news.example/three", title: "Three" },
    ];
    expect(relatedVisible(pages, ["https://news.example/two"])).toEqual([pages[1]]);
    expect(relatedCollapsed(pages, ["https://news.example/two"])).toEqual([pages[0], pages[2]]);
    expect(relatedCollapsed(pages, [])).toEqual(pages);
    expect(relatedVisible(pages, [])).toEqual([]);
    expect(relatedCountLabel(3)).toBe("3");
    expect(relatedCountLabel(0)).toBe("");
  });
});
