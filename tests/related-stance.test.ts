import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  contrastingAngle,
  contrastingAngleAbsentContents,
  contrastingAngleAbsentRail,
  contentsAbsentCopy,
  contentsKicker,
  couldNotLook,
  couldNotPlace,
  otherReporting,
  otherReportingAbsentContents,
  otherReportingAbsentRail,
  railAbsentCopy,
  stanceCopy,
} from "../src/copy";
import { createIssue, type BoundIssue, type BoundPiece, type IssueStore } from "../src/lib/bind";
import { clusterPieces, composeIssue, pieceColophon } from "../src/lib/compose";
import { resetMemoryDb } from "../src/lib/db";
import { grokModel } from "../src/lib/model";
import { printPlan } from "../src/lib/print";
import { relatedPersist, type RelatedPage } from "../src/lib/related";
import {
  applyRelatedJudgments,
  applyRelatedStances,
  buildRelatedStanceRequest,
  parseRelatedStances,
  relatedStanceJsonSchema,
  relatedStanceSystemPrompt,
  relatedStanceUserContent,
  runGrokRelatedStance,
  slotState,
} from "../src/lib/related-stance";
import { saveClip, type Clip, type ClipStore } from "../src/lib/save";
import { chosenPieces } from "../src/lib/select";
import { clipStore } from "../src/lib/store";

const harbourTopic = {
  contentType: "News" as const,
  topic: "A harbour vote",
  entities: ["Praia"],
  centralClaim: "The harbour vote should carry",
};

const quietHeadline = async () => ({ text: "The harbour vote" });

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

function piece(over: Partial<BoundPiece> & Pick<BoundPiece, "url" | "role" | "headline">): BoundPiece {
  return {
    paragraphs: ["The assembly met at dusk in Praia."],
    ...over,
  };
}

const pages: RelatedPage[] = [
  { url: "https://news.example/harbour", title: "Harbour vote in Praia", snippet: "The assembly met." },
  { url: "https://news.example/against", title: "The vote cannot bind the quay", snippet: "A legal bound." },
  { url: "https://news.example/tone", title: "A sharp note on the harbour", snippet: "Angry tone." },
];

describe("Grok related stance is not search", () => {
  it("asks only for labels on supplied pages, with no web_search or URL pick tools", () => {
    const request = buildRelatedStanceRequest(pages, {
      topic: harbourTopic,
      headline: "The harbour vote",
    });
    const body = JSON.stringify(request);

    expect(request.model).toBe(grokModel);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("search_parameters");
    expect(request).not.toHaveProperty("web_search");
    expect(Object.keys(request)).toEqual(["model", "messages", "response_format"]);
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema).toEqual(relatedStanceJsonSchema);
    expect(relatedStanceJsonSchema.properties.pages.items.properties.relevance.enum).toEqual([
      "direct",
      "contextual",
      "irrelevant",
      "uncertain",
    ]);
    expect(relatedStanceJsonSchema.properties.pages.items.properties.stance.enum).toEqual([
      "comparable",
      "contrarian",
      "inconclusive",
      null,
    ]);
    expect(relatedStanceJsonSchema.properties.pages.items.properties.stance.enum).not.toContain("absent");
    expect(body).toMatch(/must not call web_search/);
    expect(relatedStanceSystemPrompt).toMatch(/already-retrieved|already supplied/i);
    expect(relatedStanceSystemPrompt).toMatch(/must not search/i);
    expect(relatedStanceSystemPrompt).toMatch(/must not pick URLs/i);
    expect(relatedStanceSystemPrompt).toMatch(/must not invent URLs/i);
    expect(relatedStanceSystemPrompt).toMatch(/must not use tools/i);
    expect(relatedStanceSystemPrompt).toMatch(/Query origin is not stance/);
    expect(relatedStanceSystemPrompt).toMatch(/must not label a page absent/i);
    expect(request.messages[1]?.content).toMatch(/The harbour vote/);
    expect(request.messages[1]?.content).toMatch(/https:\/\/news\.example\/harbour/);
    expect(relatedStanceUserContent(pages, { topic: harbourTopic, headline: "The harbour vote" })).toMatch(
      /source headline: The harbour vote/,
    );
  });

  it("posts that same no-search body to xAI", async () => {
    let posted: unknown;
    const labeled = await runGrokRelatedStance(
      pages,
      { topic: harbourTopic, headline: "The harbour vote" },
      {
        apiKey: "test-key",
        post: async (_url, init) => {
          posted = JSON.parse(init.body);
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      pages: [
                        { url: "https://news.example/harbour", relevance: "direct", stance: "comparable" },
                        { url: "https://news.example/against", relevance: "direct", stance: "contrarian" },
                        { url: "https://news.example/tone", relevance: "uncertain", stance: "inconclusive" },
                      ],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        },
      },
    );

    expect(labeled.map((page) => page.stance)).toEqual(["comparable", "contrarian", "inconclusive"]);
    expect(posted).toEqual(
      buildRelatedStanceRequest(pages, { topic: harbourTopic, headline: "The harbour vote" }),
    );
    expect(posted).not.toHaveProperty("tools");
    expect(posted).not.toHaveProperty("search_parameters");
    expect(posted).not.toHaveProperty("web_search");
  });
});

describe("persist stance on already-retrieved pages", () => {
  afterEach(() => {
    resetMemoryDb();
    delete process.env.XAI_API_KEY;
  });

  it("writes optional stance through Keep persist and PGLite read-back", async () => {
    const store = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [{ url: "https://news.example/harbour", title: "Harbour vote in Praia" }],
      labelStance: async (found) =>
        found.map((page) => ({ ...page, stance: "comparable" as const })),
    });
    expect(clip.relatedRail).toEqual({ status: "ok" });
    expect(clip.relatedReporting).toEqual([
      { url: "https://news.example/harbour", title: "Harbour vote in Praia", stance: "comparable" },
    ]);

    const pglite = await clipStore();
    const stored = await saveClip({ url: "https://example.com/pglite-stance" }, pglite, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [{ url: "https://news.example/harbour", title: "Harbour vote in Praia" }],
      labelStance: async (found) =>
        found.map((page) => ({ ...page, stance: "contrarian" as const })),
    });
    expect((await pglite.get(stored.id))?.relatedReporting).toEqual([
      { url: "https://news.example/harbour", title: "Harbour vote in Praia", stance: "contrarian" },
    ]);

    const dropped = await saveClip({ url: "https://example.com/invented" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [{ url: "https://news.example/harbour", title: "Harbour vote in Praia" }],
      labelStance: async (found) => [
        ...found.map((page) => ({ ...page, stance: "comparable" as const })),
        { url: "https://invented.example/made-up", title: "A made-up page", stance: "contrarian" },
      ],
    });
    expect(dropped.relatedReporting?.map((page) => page.url)).toEqual(["https://news.example/harbour"]);
    expect(JSON.stringify(dropped.relatedReporting)).not.toMatch(/invented\.example/);
  });
});

describe("invented URL drop and skipped URL unlabeled", () => {
  it("drops a Grok-invented URL and leaves a skipped URL unlabeled, not silent inconclusive", () => {
    const labeled = applyRelatedStances(pages, [
      { url: "https://news.example/harbour", stance: "comparable" },
      { url: "https://invented.example/made-up", stance: "contrarian" },
    ]);
    expect(labeled.map((page) => page.url)).toEqual(pages.map((page) => page.url));
    expect(labeled.map((page) => page.url)).not.toContain("https://invented.example/made-up");
    expect(labeled[0]?.stance).toBe("comparable");
    expect(labeled[1]).not.toHaveProperty("stance");
    expect(labeled[2]).not.toHaveProperty("stance");
    expect(labeled[1]?.stance).not.toBe("inconclusive");
    expect(JSON.stringify(labeled)).not.toMatch(/invented\.example/);

    expect(parseRelatedStances({ pages: [{ url: pages[0]?.url, stance: "absent" }] }).pages).toEqual([]);
    expect(
      parseRelatedStances({
        pages: [{ url: pages[0]?.url, relevance: "direct", stance: "comparable" }],
      }).pages,
    ).toEqual([{ url: pages[0]?.url, stance: "comparable" }]);
  });

  it("drops irrelevant pages and does not treat entity overlap as a keep", () => {
    const labeled = applyRelatedJudgments(pages, [
      { url: "https://news.example/harbour", relevance: "direct", stance: "comparable" },
      { url: "https://news.example/against", relevance: "irrelevant", stance: "contrarian" },
      { url: "https://news.example/tone", relevance: "contextual" },
    ]);
    expect(labeled.map((page) => page.url)).toEqual([
      "https://news.example/harbour",
      "https://news.example/tone",
    ]);
    expect(labeled[0]?.stance).toBe("comparable");
    expect(labeled[1]).not.toHaveProperty("stance");
    expect(labeled.map((page) => page.url)).not.toContain("https://news.example/against");
  });
});

describe("label throw Keep ok; no label on fail or ok+0", () => {
  it("keeps the rail ok without stance fields when the label call throws", async () => {
    const store = memoryClips();
    const clip = await saveClip({ url: "https://example.com/label-throw" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [{ url: "https://news.example/harbour", title: "Harbour vote in Praia" }],
      labelStance: async () => {
        throw new Error("Grok stance down");
      },
    });
    expect(store.rows.has(clip.id)).toBe(true);
    expect(clip.relatedRail).toEqual({ status: "ok" });
    expect(clip.relatedReporting).toEqual([
      { url: "https://news.example/harbour", title: "Harbour vote in Praia" },
    ]);
    expect(clip.relatedReporting?.[0]).not.toHaveProperty("stance");
    expect(clip.relatedRail?.status).not.toBe("failed");
  });

  it("does not label on retrieval-fail or ok+0", async () => {
    const store = memoryClips();
    let called = 0;
    const labelStance = async (found: RelatedPage[]) => {
      called += 1;
      return found;
    };

    const failed = await saveClip({ url: "https://example.com/no-label-fail" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => {
        throw new Error("search down");
      },
      labelStance,
    });
    expect(failed.relatedRail).toMatchObject({ status: "failed", message: "search down" });
    expect(failed.relatedReporting).toBeNull();
    expect(called).toBe(0);

    const empty = await saveClip({ url: "https://example.com/no-label-empty" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [],
      labelStance,
    });
    expect(empty.relatedRail).toEqual({ status: "ok" });
    expect(empty.relatedReporting).toEqual([]);
    expect(called).toBe(0);
  });
});

describe("query origin is not stance", () => {
  it("does not stamp comparable or contrarian from the search string that found the page", async () => {
    const store = memoryClips();
    const queries: string[] = [];
    const clip = await saveClip({ url: "https://example.com/query-not-stance" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchStrings: async () => ({
        comparable: "harbour vote Praia reporting",
        contrarian: "harbour vote opposition Praia",
      }),
      searchPages: async ({ query }) => {
        queries.push(query);
        if (query.includes("opposition")) {
          return [{ url: "https://news.example/against", title: "Harbour vote opposition in Praia" }];
        }
        return [{ url: "https://news.example/harbour", title: "Harbour vote in Praia" }];
      },
      labelStance: async (found) =>
        found.map((page) =>
          page.url.includes("against")
            ? { ...page, stance: "comparable" as const }
            : { ...page, stance: "contrarian" as const },
        ),
    });
    expect(queries).toEqual(["harbour vote Praia reporting", "harbour vote opposition Praia"]);
    expect(clip.relatedReporting).toEqual([
      { url: "https://news.example/harbour", title: "Harbour vote in Praia", stance: "contrarian" },
      { url: "https://news.example/against", title: "Harbour vote opposition in Praia", stance: "comparable" },
    ]);
  });
});

describe("bind without contrarian, Select still free", () => {
  it("binds related without a contrarian piece and still lets every stance be selected", async () => {
    const store = memoryClips();
    const clip = await saveClip({ url: "https://example.com/kept" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [
        { url: "https://news.example/one", title: "Harbour vote in Praia" },
        { url: "https://news.example/two", title: "Harbour vote follow-up" },
      ],
      labelStance: async (found) =>
        found.map((page, index) => ({
          ...page,
          stance: index === 0 ? ("comparable" as const) : ("inconclusive" as const),
        })),
    });
    expect(
      chosenPieces(clip, {
        includeOriginal: true,
        relatedUrls: ["https://news.example/one", "https://news.example/two"],
      }).map((item) => item.url),
    ).toEqual(["https://example.com/kept", "https://news.example/one", "https://news.example/two"]);

    const bound = await createIssue(
      { clip, choice: { includeOriginal: true, relatedUrls: ["https://news.example/one"] } },
      memoryIssues(),
      {
        fetchWords: async (url) => ({
          url,
          headline: url.includes("one") ? "A second dispatch" : "The harbour vote",
          paragraphs: url.includes("one")
            ? ["Another reporter stood on the quay."]
            : ["The assembly met at dusk in Praia."],
        }),
        writeTake: async () => {
          throw new Error("no take");
        },
      },
    );
    expect(bound.pieces.map((item) => item.role)).toEqual(["original", "related"]);
    expect(bound.pieces[1]?.stance).toBe("comparable");
    expect(bound.pieces.some((item) => item.stance === "contrarian")).toBe(false);
    expect(bound.pieces[0]).not.toHaveProperty("stance");
  });
});

describe("compose order when any stance", () => {
  it("orders original → comparable → contrarian → inconclusive → unlabeled and clusters topic within", () => {
    const pieces: BoundPiece[] = [
      piece({
        url: "https://example.com/kept",
        role: "original",
        headline: "The harbour vote",
        topic: "A harbour vote",
      }),
      piece({
        url: "https://news.example/unlabeled",
        role: "related",
        headline: "Unlabeled note",
        topic: "A harbour vote",
      }),
      piece({
        url: "https://news.example/inconclusive",
        role: "related",
        headline: "Could not place this",
        stance: "inconclusive",
        topic: "A harbour vote",
      }),
      piece({
        url: "https://hills.example/storm",
        role: "related",
        headline: "A distant storm",
        stance: "comparable",
        topic: "Weather inland",
      }),
      piece({
        url: "https://news.example/against",
        role: "related",
        headline: "The vote cannot bind the quay",
        stance: "contrarian",
        topic: "A harbour vote",
      }),
      piece({
        url: "https://news.example/other",
        role: "related",
        headline: "Other reporting on the vote",
        stance: "comparable",
        topic: "A harbour vote",
      }),
    ];
    expect(clusterPieces(pieces).map((item) => item.headline)).toEqual([
      "The harbour vote",
      "Other reporting on the vote",
      "A distant storm",
      "The vote cannot bind the quay",
      "Could not place this",
      "Unlabeled note",
    ]);
    const compose = readFileSync("src/lib/compose.ts", "utf8");
    expect(compose).toMatch(/cluster by topic, never by hostname/);
    expect(compose).not.toMatch(/hostnameOf\(piece/);
  });
});

describe("absent rows", () => {
  it("shows rail and contents absent rows only when every page is judged", () => {
    const judged: RelatedPage[] = [
      { url: "https://news.example/a", stance: "inconclusive" },
      { url: "https://news.example/b", stance: "inconclusive" },
      { url: "https://news.example/c", stance: "inconclusive" },
    ];
    expect(slotState(judged, "comparable")).toBe("absent");
    expect(slotState(judged, "contrarian")).toBe("absent");
    expect(railAbsentCopy("comparable")).toBe(otherReportingAbsentRail);
    expect(railAbsentCopy("contrarian")).toBe(contrastingAngleAbsentRail);

    const page = composeIssue({
      id: "issue-absent",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" }),
        piece({
          url: "https://news.example/a",
          role: "related",
          headline: "A look",
          stance: "inconclusive",
        }),
        piece({
          url: "https://news.example/b",
          role: "related",
          headline: "Another look",
          stance: "inconclusive",
        }),
        piece({
          url: "https://news.example/c",
          role: "related",
          headline: "A third look",
          stance: "inconclusive",
        }),
      ],
    });
    expect(page.contents.rows.filter((row) => row.absent).map((row) => row.title)).toEqual([
      otherReportingAbsentContents,
      contrastingAngleAbsentContents,
    ]);
    expect(page.contents.rows.filter((row) => row.absent).every((row) => row.folio === "")).toBe(true);
    expect(page.sequence.map((sheet) => sheet.headline)).not.toContain(contrastingAngleAbsentContents);
    expect(JSON.stringify(page.cover)).not.toMatch(/missing from this issue|no contrasting piece/);
    expect(JSON.stringify(page.cover)).not.toMatch(/invented\.example/);
    expect(page.take).toBeUndefined();

    const plan = printPlan({
      id: "issue-absent",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" }),
        piece({
          url: "https://news.example/a",
          role: "related",
          headline: "A look",
          stance: "inconclusive",
        }),
      ],
    });
    const contents = plan.sheets.find((sheet) => sheet.kind === "contents");
    expect(contents?.kind).toBe("contents");
    if (contents?.kind === "contents") {
      expect(contents.rows.some((row) => row.title === contrastingAngleAbsentContents && row.absent)).toBe(
        true,
      );
      expect(contents.rows.filter((row) => row.absent).every((row) => !row.folio)).toBe(true);
    }
  });

  it("does not show an absent row on label-fail, ok+0, retrieval-fail, bind-only-original, or partial labels", async () => {
    expect(slotState([], "contrarian")).toBe("unjudged");
    const unlabeled: RelatedPage[] = [{ url: "https://news.example/a" }];
    expect(slotState(unlabeled, "contrarian")).toBe("unjudged");
    const partial: RelatedPage[] = [
      { url: "https://news.example/a", stance: "comparable" },
      { url: "https://news.example/b" },
    ];
    expect(slotState(partial, "contrarian")).toBe("unjudged");

    const originalOnly = composeIssue({
      id: "issue-original",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" })],
    });
    expect(originalOnly.contents.rows.some((row) => row.absent)).toBe(false);
    expect(originalOnly.contents.rows.map((row) => row.title)).toEqual(["The harbour vote"]);

    const unlabeledRelated = composeIssue({
      id: "issue-unlabeled",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" }),
        piece({ url: "https://news.example/a", role: "related", headline: "A look" }),
        piece({
          url: "https://news.example/b",
          role: "related",
          headline: "Other reporting",
          stance: "comparable",
        }),
      ],
    });
    expect(unlabeledRelated.contents.rows.some((row) => row.absent)).toBe(false);
    expect(unlabeledRelated.contents.rows.map((row) => row.title)).not.toContain(
      contrastingAngleAbsentContents,
    );
    expect(unlabeledRelated.contents.rows[0]).not.toHaveProperty("stance");
    expect(unlabeledRelated.contents.rows.find((row) => row.title === "A look")).not.toHaveProperty("stance");
    expect(unlabeledRelated.contents.rows.find((row) => row.title === "Other reporting")?.stance).toBe(
      "comparable",
    );

    const store = memoryClips();
    const empty = await saveClip({ url: "https://example.com/ok-zero" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => [],
    });
    expect(empty.relatedReporting).toEqual([]);
    expect(slotState(empty.relatedReporting ?? [], "contrarian")).toBe("unjudged");

    const failed = await saveClip({ url: "https://example.com/rail-fail" }, store, {
      readHeadline: quietHeadline,
      understand: async () => harbourTopic,
      searchPages: async () => {
        throw new Error(couldNotLook);
      },
    });
    expect(failed.relatedReporting).toBeNull();
    expect(slotState(failed.relatedReporting ?? [], "contrarian")).toBe("unjudged");
  });
});

describe("stance criteria: bound, opposite conclusion, tone, insufficient", () => {
  it("treats material resistance to a carrying bound as contrarian", () => {
    expect(relatedStanceSystemPrompt).toMatch(/carrying assumption, interpretation, causality, implication, or bound/);
    expect(relatedStanceSystemPrompt).toMatch(/Material resistance to a carrying bound/);
    const labeled = applyRelatedStances(
      [{ url: "https://news.example/bound", title: "The vote cannot bind the quay" }],
      [{ url: "https://news.example/bound", stance: "contrarian" }],
    );
    expect(labeled[0]?.stance).toBe("contrarian");
    expect(stanceCopy(labeled[0]!.stance!)).toBe(contrastingAngle);
  });

  it("treats an opposite conclusion alone as inconclusive", () => {
    expect(relatedStanceSystemPrompt).toMatch(/opposite conclusion alone is inconclusive/i);
    const labeled = applyRelatedStances(
      [{ url: "https://news.example/opposite", title: "The motion failed" }],
      [{ url: "https://news.example/opposite", stance: "inconclusive" }],
    );
    expect(labeled[0]?.stance).toBe("inconclusive");
    expect(labeled[0]?.stance).not.toBe("contrarian");
    expect(stanceCopy("inconclusive")).toBe(couldNotPlace);
  });

  it("does not treat tone or aspect alone as contrarian", () => {
    expect(relatedStanceSystemPrompt).toMatch(/Tone or aspect alone is not contrarian/);
    expect(relatedStanceSystemPrompt).toMatch(/Contrarian is not tone/);
    const labeled = applyRelatedStances(
      [{ url: "https://news.example/tone", title: "A sharp note on the harbour" }],
      [{ url: "https://news.example/tone", stance: "inconclusive" }],
    );
    expect(labeled[0]?.stance).not.toBe("contrarian");
    expect(labeled[0]?.stance).toBe("inconclusive");
  });

  it("treats insufficient material as inconclusive", () => {
    expect(relatedStanceSystemPrompt).toMatch(/Insufficient material to place the angle is inconclusive/);
    const labeled = applyRelatedStances(
      [{ url: "https://news.example/thin", title: "Brief" }],
      [{ url: "https://news.example/thin", stance: "inconclusive" }],
    );
    expect(labeled[0]?.stance).toBe("inconclusive");
    expect(slotState(labeled, "contrarian")).toBe("absent");
    expect(slotState(labeled, "comparable")).toBe("absent");
  });
});

describe("Designer UI lock", () => {
  it("keeps Helm GO copy strings exact, including the contents kicker", () => {
    expect(otherReporting).toBe("Other reporting");
    expect(contrastingAngle).toBe("A contrasting angle");
    expect(couldNotPlace).toBe("Could not place");
    expect(otherReportingAbsentRail).toBe("Other reporting — not in this set.");
    expect(contrastingAngleAbsentRail).toBe("A contrasting angle — not in this set.");
    expect(otherReportingAbsentContents).toBe("Other reporting is missing from this issue.");
    expect(contrastingAngleAbsentContents).toBe("This issue has no contrasting piece.");
    expect(stanceCopy("comparable")).toBe("Other reporting");
    expect(stanceCopy("contrarian")).toBe("A contrasting angle");
    expect(stanceCopy("inconclusive")).toBe("Could not place");
    expect(readFileSync("src/copy.ts", "utf8")).toMatch(/export const contentsKicker = "In this issue"/);
  });

  it("puts Desk stance under the related headline in muted Sans, quiets Could not place, and uses no red, icon, or fourth hex", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const related = keep.slice(keep.indexOf("function RelatedItem"));
    expect(related.indexOf("row.title")).toBeLessThan(related.indexOf("row.stance"));
    expect(related.indexOf("row.stance")).toBeLessThan(related.indexOf("row.snippet"));
    expect(related).toMatch(/row\.stance \? \(/);
    expect(related).toMatch(/row\.stance \? \([\s\S]*stanceCopy\(row\.stance\)[\s\S]*\) : null/);
    expect(related).toMatch(/stance === "inconclusive" \? "stance quiet" : "stance"/);
    expect(related).toMatch(/stanceCopy\(row\.stance\)/);
    expect(related).not.toMatch(/className="fail"|lucide|svg|<img|⚠|✘|✗|✓|●|icon|AI labeled/i);
    expect(related).not.toMatch(/disabled=\{page\.stance/);
    expect(related).toMatch(/className="include"/);
    expect(keep).toMatch(/railAbsentCopy\("comparable"\)/);
    expect(keep).toMatch(/className="stance"\>\{railAbsentCopy/);
    expect(keep).not.toMatch(/className="empty"\>\{railAbsentCopy/);
    expect(keep).not.toMatch(/className="fail"\>\{railAbsentCopy/);
    expect(css).toMatch(/--muted: color-mix\(in srgb, var\(--ink\) 58%, var\(--paper\)\)/);
    expect(css).toMatch(/button\.related-title \{[\s\S]*font-family:\s*var\(--font-serif\)/);
    expect(css).toMatch(/\.rail li \.stance \{[\s\S]*font-family:\s*var\(--font-sans\)[\s\S]*color:\s*var\(--muted\)/);
    expect(css).toMatch(/\.rail li \.stance\.quiet \{[\s\S]*color-mix\(in srgb, var\(--ink\) 42%/);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
    expect(css).not.toMatch(/AI labeled/i);
    expect(keep).not.toMatch(/AI labeled/i);
    expect(readFileSync("src/routes/read.$id.tsx", "utf8")).not.toMatch(/AI labeled/i);
    const stanceBlocks = [...css.matchAll(/\.rail li \.stance[^{]*\{[^}]+\}/g)].map((match) => match[0]);
    expect(stanceBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of stanceBlocks) {
      expect(block).toMatch(/var\(--ink\)|var\(--paper\)|var\(--muted\)/);
      expect(block).not.toMatch(/#c00|#e00|#f00|red|crimson|tomato|salmon|orange|#[0-9a-f]{3,8}/i);
    }
  });

  it("leaves Select free for every stance", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const related = keep.slice(keep.indexOf("function RelatedItem"));
    expect(related).toMatch(/onToggle\(page\.url, !on\)/);
    expect(related).not.toMatch(/disabled=\{/);
    expect(chosenPieces(
      {
        id: "clip-1",
        url: "https://example.com/kept",
        savedAt: "2026-09-01T00:00:00.000Z",
        understanding: { status: "ok", ...harbourTopic },
        relatedRail: { status: "ok" },
        relatedReporting: [
          { url: "https://news.example/a", stance: "comparable" },
          { url: "https://news.example/b", stance: "contrarian" },
          { url: "https://news.example/c", stance: "inconclusive" },
          { url: "https://news.example/d" },
        ],
        sourceHeadline: null,
      },
      {
        includeOriginal: true,
        relatedUrls: [
          "https://news.example/a",
          "https://news.example/b",
          "https://news.example/c",
          "https://news.example/d",
        ],
      },
    ).map((item) => item.url)).toEqual([
      "https://example.com/kept",
      "https://news.example/a",
      "https://news.example/b",
      "https://news.example/c",
      "https://news.example/d",
    ]);
  });

  it("treats contents as the argument: absent rows without folio only when related is bound and judged", () => {
    const judged = composeIssue({
      id: "issue-lock",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" }),
        piece({
          url: "https://news.example/a",
          role: "related",
          headline: "Other reporting on the vote",
          stance: "comparable",
        }),
      ],
    });
    expect(judged.contents.kicker).toBe(contentsKicker);
    expect(judged.contents.kicker).toBe("In this issue");
    expect(
      judged.contents.rows.map((row) => ({
        title: row.title,
        folio: row.folio,
        absent: row.absent,
        stance: row.stance,
      })),
    ).toEqual([
      { title: "The harbour vote", folio: "03", absent: undefined, stance: undefined },
      { title: "Other reporting on the vote", folio: "04", absent: undefined, stance: "comparable" },
      { title: contrastingAngleAbsentContents, folio: "", absent: true, stance: undefined },
    ]);
    expect(judged.contents.rows[0]?.title).toBe("The harbour vote");
    expect(judged.contents.rows[0]).not.toHaveProperty("stance");
    expect(judged.contents.rows[0]?.title).not.toMatch(/Other reporting|A contrasting angle|Could not place/);
    expect(judged.contents.rows[1]?.title).toBe("Other reporting on the vote");
    expect(judged.contents.rows[1]?.stance).toBe("comparable");
    expect(judged.contents.rows.filter((row) => row.absent).map((row) => row.title)).toEqual([
      contrastingAngleAbsentContents,
    ]);
    const bothAbsent = composeIssue({
      id: "issue-both-absent",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" }),
        piece({
          url: "https://news.example/a",
          role: "related",
          headline: "A look",
          stance: "inconclusive",
        }),
      ],
    });
    expect(bothAbsent.contents.rows.filter((row) => row.absent).map((row) => row.title)).toEqual([
      otherReportingAbsentContents,
      contrastingAngleAbsentContents,
    ]);
    expect(bothAbsent.contents.rows[0]).not.toHaveProperty("stance");
    expect(bothAbsent.contents.rows[1]).toMatchObject({
      title: "A look",
      folio: "04",
      stance: "inconclusive",
    });
    expect(judged.sequence.some((sheet) => sheet.headline === contrastingAngleAbsentContents)).toBe(false);
    expect(JSON.stringify(judged.cover)).not.toMatch(/Other reporting|A contrasting angle|Could not place|no contrasting piece|missing from this issue/);
    expect(judged.cover.masthead).toBe("Quire");
    expect(judged.take).toBeUndefined();
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const contents = read.slice(read.indexOf('className="toc-row"'), read.indexOf("function PieceSheet"));
    expect(read).toMatch(/className="toc-absent"/);
    expect(contents).toMatch(/stanceCopy\(row\.stance\)/);
    expect(contents.indexOf("toc-stance")).toBeLessThan(contents.indexOf("toc-title"));
    expect(contents.indexOf("toc-title")).toBeLessThan(contents.indexOf("toc-dots"));
    expect(contents.indexOf("toc-dots")).toBeLessThan(contents.lastIndexOf("{row.folio}"));
    expect(contents).toMatch(/stance === "inconclusive" \? "toc-stance quiet" : "toc-stance"/);
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.toc-absent \{[\s\S]*font-family:\s*var\(--font-sans\)[\s\S]*color:\s*var\(--muted\)/);
    expect(css).toMatch(/\.toc-title \{[\s\S]*font-family:\s*var\(--font-serif\)/);
    expect(css).toMatch(/\.toc-stance \{[\s\S]*font-family:\s*var\(--font-sans\)[\s\S]*color:\s*var\(--muted\)/);
    expect(css).toMatch(/\.toc-stance\.quiet \{[\s\S]*color-mix\(in srgb, var\(--ink\) 42%/);
    const stanceBlocks = [...css.matchAll(/\.toc-stance[^{]*\{[^}]+\}/g)].map((match) => match[0]);
    expect(stanceBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of stanceBlocks) {
      expect(block).toMatch(/var\(--ink\)|var\(--paper\)|var\(--muted\)/);
      expect(block).not.toMatch(/#c00|#e00|#f00|red|crimson|tomato|salmon|orange|#[0-9a-f]{3,8}/i);
    }

    const originalOnly = composeIssue({
      id: "issue-original-lock",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" })],
    });
    expect(originalOnly.contents.rows.some((row) => row.absent)).toBe(false);
  });

  it("puts piece stance in the colophon only, and Print uses the same plan", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const pieceSheet = read.slice(read.indexOf("function PieceSheet"), read.indexOf("function SheetPhoto"));
    expect(pieceSheet).toMatch(/sheet\.colophon \? <p className="colophon">\{sheet\.colophon\}<\/p> : null/);
    expect(pieceSheet).not.toMatch(/stanceCopy|sheet\.stance|row\.stance/);
    expect(pieceSheet).not.toMatch(/className="stance"|Could not place|A contrasting angle|AI labeled/);
    expect(pieceSheet).toMatch(/<h2>\{sheet\.headline\}<\/h2>/);
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.colophon \{[\s\S]*font-family:\s*var\(--font-sans\)[\s\S]*color:\s*var\(--muted\)/);
    expect(css).toMatch(/\.piece-header h2 \{[\s\S]*font-family:\s*var\(--font-serif\)/);
    expect(
      pieceColophon(
        piece({
          url: "https://news.example/against",
          role: "related",
          headline: "Against",
          publisher: "Praia Daily",
          published: "2026-09-01",
          stance: "contrarian",
        }),
      ),
    ).toBe("Praia Daily · 1 September 2026 · A contrasting angle");
    const issue = {
      id: "issue-print-lock",
      createdAt: "2026-09-01T00:00:00.000Z",
      title: "The harbour vote",
      leadUrl: "https://example.com/kept",
      take: null,
      pieces: [
        piece({ url: "https://example.com/kept", role: "original", headline: "The harbour vote" }),
        piece({
          url: "https://news.example/a",
          role: "related",
          headline: "A look",
          stance: "inconclusive",
        }),
      ],
    };
    const page = composeIssue(issue);
    const plan = printPlan(issue);
    const contents = plan.sheets.find((sheet) => sheet.kind === "contents");
    expect(contents?.kind).toBe("contents");
    if (contents?.kind === "contents") {
      expect(contents.rows).toEqual(page.contents.rows);
    }
    expect(plan.intent).toEqual(page.intent);
    expect(page.sequence[1]?.colophon).toBe(couldNotPlace);
    expect(page.sequence[1]).not.toHaveProperty("stance");
  });
});

describe("Desk, colophon, and Select stay free", () => {
  it("places stance under the related headline and keeps include free", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const related = keep.slice(keep.indexOf("function RelatedItem"));
    expect(related.indexOf("row.title")).toBeLessThan(related.indexOf("row.stance"));
    expect(related).toMatch(/stance === "inconclusive" \? "stance quiet" : "stance"/);
    expect(related).toMatch(/stanceCopy\(row\.stance\)/);
    expect(related).toMatch(/className="include"/);
    expect(related).not.toMatch(/disabled=\{page\.stance/);
    expect(related).not.toMatch(/stance === "inconclusive"[\s\S]{0,80}disabled/);
    expect(keep).toMatch(/railAbsentCopy\("comparable"\)/);
    expect(keep).toMatch(/railAbsentCopy\("contrarian"\)/);
    expect(keep).toMatch(/slotState\(pages, "comparable"\)/);
    expect(keep).not.toMatch(/href=\{page\.url\}/);
  });

  it("puts related stance in the piece colophon and contents absent rows on Read and Print", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/row\.absent/);
    expect(read).toMatch(/toc-absent/);
    expect(read).toMatch(/pieceSheetIndex\(rowIndex\)/);
    expect(read).toMatch(/sheet\.colophon \? <p className="colophon">\{sheet\.colophon\}<\/p> : null/);
    expect(
      pieceColophon(
        piece({
          url: "https://news.example/against",
          role: "related",
          headline: "Against",
          publisher: "Praia Daily",
          published: "2026-09-01",
          stance: "contrarian",
        }),
      ),
    ).toBe("Praia Daily · 1 September 2026 · A contrasting angle");
    expect(
      pieceColophon(
        piece({
          url: "https://example.com/kept",
          role: "original",
          headline: "The harbour vote",
          publisher: "Praia Daily",
          published: "2026-09-01",
        }),
      ),
    ).toBe("Praia Daily · 1 September 2026");
    const compositor = readFileSync("src/lib/print-compose.ts", "utf8");
    expect(compositor).toMatch(/row\.absent/);
    expect(compositor).toMatch(/if \(row\.folio\)/);
    expect(compositor).toMatch(/stanceCopy\(row\.stance\)/);
    expect(compositor).toMatch(/row\.stance === "inconclusive"/);
  });
});

describe("copy stays in the stereo-rail register", () => {
  it("keeps could not look, could not place, not in this set, and no contrasting piece apart", () => {
    expect(otherReporting).toBe("Other reporting");
    expect(contrastingAngle).toBe("A contrasting angle");
    expect(couldNotPlace).toBe("Could not place");
    expect(contentsAbsentCopy("comparable")).toBe(otherReportingAbsentContents);
    expect(contentsAbsentCopy("contrarian")).toBe(contrastingAngleAbsentContents);
    expect(couldNotLook).not.toBe(couldNotPlace);
    expect(couldNotLook).not.toBe(contrastingAngleAbsentRail);
  });
});
