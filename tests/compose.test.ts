import { describe, expect, it } from "vitest";
import { composeIssue } from "../src/lib/compose";
import type { BoundIssue } from "../src/lib/bind";
import { designContract } from "../src/lib/design";

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
    expect(page.intent.composition).toBe("visual-opener");
    expect(designContract.treatments).toContain(page.intent.treatment);
  });

  it("places an ok take beside the original, never as a second lead", () => {
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
  });
});
