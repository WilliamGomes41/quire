import { describe, expect, it } from "vitest";
import { composeIssue, readingSheets } from "../src/lib/compose";
import type { BoundIssue } from "../src/lib/bind";
import { defaultFigureFit, designContract } from "../src/lib/design";

const issue: BoundIssue = {
  id: "issue-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  title: "The harbour vote",
  leadUrl: "https://example.com/kept",
  take: null,
  pieces: [
    {
      url: "https://example.com/kept",
      role: "original",
      headline: "The harbour vote",
      paragraphs: ["The assembly met at dusk in Praia.", "The motion carried after a quiet count."],
    },
  ],
};

describe("Read composition", () => {
  it("is valid without a take and still carries the original words", () => {
    const page = composeIssue(issue);
    expect(page.take).toBeUndefined();
    expect(page.lead.paragraphs).toEqual(issue.pieces[0]?.paragraphs);
    expect(page.intent.take_slot).toBe("none");
    expect(page.intent.composition).toBe("essay");
    expect(designContract.treatments).toContain(page.intent.treatment);
    expect(page.sequence[0]?.paragraphs.join(" ")).toMatch(/assembly met at dusk/);
    expect(page.sequence[0]?.take).toBeUndefined();
  });

  it("places an ok take as an unlabeled standfirst, never as a second lead", () => {
    const page = composeIssue({
      ...issue,
      take: { status: "ok", text: "A quiet count in Praia." },
      pieces: [
        ...issue.pieces,
        {
          url: "https://news.example/one",
          role: "related",
          headline: "A second dispatch",
          paragraphs: ["Another reporter stood on the quay."],
        },
      ],
    });
    expect(page.take).toEqual({ text: "A quiet count in Praia." });
    expect(page.lead.url).toBe("https://example.com/kept");
    expect(page.secondary).toHaveLength(1);
    expect(page.secondary[0]?.paragraphs.join(" ")).toMatch(/Another reporter/);
    expect(page.intent.take_slot).toBe("body-with-sidebar");
    expect(page.intent.treatment).toBe("feature");
    expect(page.sequence[0]?.take).toEqual({ text: "A quiet count in Praia." });
    expect(page.sequence[1]?.take).toBeUndefined();
    expect(page.sequence[1]?.paragraphs.join(" ")).toMatch(/Another reporter/);
  });

  it("plans cover, contents, and sequence instead of a single opener column", () => {
    const page = composeIssue({
      ...issue,
      take: { status: "ok", text: "A quiet count in Praia." },
      pieces: [
        ...issue.pieces,
        {
          url: "https://news.example/one",
          role: "related",
          headline: "A second dispatch",
          paragraphs: ["Another reporter stood on the quay."],
        },
      ],
    });
    expect(page.cover.title).toBe("The harbour vote");
    expect(page.cover.masthead).toBe("Quire");
    expect(page.cover.lead).toBe("The harbour vote");
    expect(page.cover.meta).not.toMatch(/https?:\/\//);
    expect(page.contents.rows.map((row) => row.title)).toEqual([
      "The harbour vote",
      "A second dispatch",
    ]);
    expect(page.contents.folio).toBe("02");
    expect(page.contents.folio).toMatch(/^\d+$/);
    expect(page.contents.rows.map((row) => row.folio)).toEqual(["03", "04"]);
    expect(page.sequence).toHaveLength(2);
    expect(page.sequence.map((sheet) => sheet.folio)).toEqual(["03", "04"]);
    expect(readingSheets(page).map((sheet) => sheet.kind)).toEqual([
      "cover",
      "contents",
      "piece",
      "piece",
    ]);
    expect(JSON.stringify(page.cover)).not.toMatch(/https:\/\/example\.com\/kept/);
    expect(page.contents.rows.every((row) => !row.folio.includes("http"))).toBe(true);
    expect(page.cover.kicker).toBeUndefined();
    expect(JSON.stringify(page.cover)).not.toMatch(/A personal press/);
    expect(page.contents.kicker).toBe("In this issue");
    expect(page.cover.masthead).toBe("Quire");
  });

  it("omits the cover kicker unless bind already has a source-owned cover line", () => {
    const page = composeIssue({
      ...issue,
      take: { status: "ok", text: "A quiet count in Praia." },
      title: "A harbour vote",
    });
    expect(page.cover.kicker).toBeUndefined();
    expect(page.cover.kicker).not.toBe("A personal press");
    expect(JSON.stringify(page.cover)).not.toMatch(/A personal press/);
    expect(JSON.stringify(page.cover)).not.toMatch(/A quiet count in Praia/);
    expect(page.cover.title).toBe("A harbour vote");
    expect(page.take).toEqual({ text: "A quiet count in Praia." });
    expect(page.contents.kicker).toBe("In this issue");
    expect(page.cover.masthead).toBe("Quire");

    const withLine = composeIssue({
      ...issue,
      take: { status: "ok", text: "A quiet count in Praia." },
      pieces: [
        {
          ...issue.pieces[0]!,
          coverLine: "Praia dispatch",
        },
      ],
    });
    expect(withLine.cover.kicker).toBe("Praia dispatch");
    expect(withLine.cover.kicker).not.toBe("A personal press");
    expect(withLine.cover.kicker).not.toBe(withLine.take?.text);
    expect(withLine.contents.kicker).toBe("In this issue");
    expect(withLine.cover.masthead).toBe("Quire");
  });

  it("keeps photographs at contain unless Intent already says cover", () => {
    const page = composeIssue({
      ...issue,
      pieces: [
        {
          ...issue.pieces[0]!,
          figure: "https://images.example/harbour.jpg",
        },
      ],
    });
    expect(defaultFigureFit()).toBe("contain");
    expect(page.intent.figure_fit).toBe("contain");
    expect(page.cover.figure).toEqual({
      url: "https://images.example/harbour.jpg",
      fit: "contain",
    });
    expect(page.sequence[0]?.figure?.fit).toBe("contain");
    expect(page.intent.composition).toBe("visual-opener");
  });
});
