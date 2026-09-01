import { describe, expect, it } from "vitest";
import { chosenPieces, defaultBindChoice, readBindChoice } from "../src/lib/select";
import type { Clip } from "../src/lib/save";

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: "clip-1",
    url: "https://example.com/kept",
    savedAt: "2026-09-01T00:00:00.000Z",
    understanding: {
      status: "ok",
      contentType: "News",
      topic: "A harbour vote",
      entities: ["Praia"],
    },
    relatedRail: { status: "ok" },
    relatedReporting: [
      { url: "https://news.example/one", title: "Harbour vote in Praia" },
      { url: "https://news.example/two", title: "Harbour vote follow-up" },
    ],
    ...over,
  };
}

describe("bind includes the original by default", () => {
  it("selects the kept piece and no related until they are chosen", () => {
    expect(defaultBindChoice()).toEqual({ includeOriginal: true, relatedUrls: [] });
    expect(readBindChoice(undefined).includeOriginal).toBe(true);
    expect(readBindChoice({}).includeOriginal).toBe(true);
    expect(chosenPieces(clip(), defaultBindChoice())).toEqual([
      { url: "https://example.com/kept", role: "original" },
    ]);
    expect(chosenPieces(clip(), {})).toEqual([{ url: "https://example.com/kept", role: "original" }]);
  });
});

describe("related join only when selected", () => {
  it("leaves suggestions out until their URL is selected, and only from the rail", () => {
    const kept = clip();
    expect(chosenPieces(kept, { includeOriginal: true, relatedUrls: [] }).map((p) => p.url)).toEqual([
      "https://example.com/kept",
    ]);
    expect(
      chosenPieces(kept, {
        includeOriginal: true,
        relatedUrls: ["https://news.example/one"],
      }).map((p) => p.url),
    ).toEqual(["https://example.com/kept", "https://news.example/one"]);
    expect(
      chosenPieces(kept, {
        includeOriginal: true,
        relatedUrls: ["https://not-a-suggestion.example"],
      }).map((p) => p.url),
    ).toEqual(["https://example.com/kept"]);
  });

  it("lets the original be deselected and still binds only what was chosen, once", () => {
    const kept = clip();
    expect(
      chosenPieces(kept, {
        includeOriginal: false,
        relatedUrls: ["https://news.example/two", "https://news.example/two"],
      }),
    ).toEqual([{ url: "https://news.example/two", role: "related" }]);
    expect(
      chosenPieces(kept, {
        includeOriginal: true,
        relatedUrls: ["https://example.com/kept", "https://news.example/one", "https://news.example/one"],
      }).map((p) => p.url),
    ).toEqual(["https://example.com/kept", "https://news.example/one"]);
  });
});
