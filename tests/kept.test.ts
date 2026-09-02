import { describe, expect, it } from "vitest";
import { hostnameOf, keptHeading, paperBadgeLabel, relatedRow } from "../src/lib/kept";
import type { Clip } from "../src/lib/save";
import type { UnderstandingRecord } from "../src/lib/understanding";

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: "clip-1",
    url: "https://www.news.example/harbour",
    savedAt: "2026-09-01T00:00:00.000Z",
    understanding: null,
    relatedRail: null,
    relatedReporting: null,
    ...over,
  };
}

describe("kept card heading", () => {
  it("uses host, not the clip URL, when understanding is missing", () => {
    expect(hostnameOf("https://www.news.example/harbour")).toBe("news.example");
    expect(keptHeading(clip())).toBe("news.example");
    expect(keptHeading(clip())).not.toBe("https://www.news.example/harbour");
  });

  it("uses the stored topic as heading when understanding is ok", () => {
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
    expect(keptHeading(understood)).not.toBe(understood.url);
  });

  it("falls back to host when understanding failed", () => {
    const failed: UnderstandingRecord = { status: "failed", message: "model down", at: "2026-09-01T00:00:00.000Z" };
    expect(keptHeading(clip({ understanding: failed }))).toBe("news.example");
    expect(keptHeading(clip({ understanding: failed }))).not.toBe("https://www.news.example/harbour");
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
    });
  });

  it("falls back to the url as title when none is stored", () => {
    expect(relatedRow({ url: "https://news.example/one" })).toEqual({
      title: "https://news.example/one",
      host: "news.example",
      snippet: "",
    });
  });
});
