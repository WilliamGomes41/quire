import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeIssue } from "../src/lib/compose";
import type { BoundIssue } from "../src/lib/bind";
import { kicker } from "../src/copy";

const issue: BoundIssue = {
  id: "issue-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  title: "The harbour vote",
  leadUrl: "https://example.com/kept",
  take: { status: "ok", text: "A quiet count in Praia." },
  pieces: [
    {
      url: "https://example.com/kept",
      role: "original",
      headline: "The harbour vote",
      paragraphs: ["The assembly met at dusk in Praia.", "The motion carried after a quiet count."],
      figure: "https://images.example/harbour.jpg",
    },
  ],
};

describe("bound magazine sheet", () => {
  it("Read is cover / contents / sequence, not opener + Take aside", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/data-sheet="cover"/);
    expect(read).toMatch(/data-sheet="contents"/);
    expect(read).toMatch(/data-sheet="piece"/);
    expect(read).toMatch(/page\.sequence\.map/);
    expect(read).not.toMatch(/className="opener"/);
    expect(read).not.toMatch(/className="spread"/);
    expect(read).not.toMatch(/className="aside"/);
    expect(read).not.toMatch(/className="lead-copy"/);
    expect(read).not.toMatch(/takeLabel/);
    expect(read).not.toMatch(/>Take</);
    expect(read).not.toMatch(/The take/);
    expect(read).not.toMatch(/TL;DR|tl;dr/);
    expect(read).not.toMatch(/href=\{/);
    expect(read).not.toMatch(/page\.opener/);
    expect(read).toMatch(/className="take"/);
    expect(read).toMatch(/sheet\.take \?/);
  });

  it("does not print a Take kicker or a raw source URL as the folio", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const page = composeIssue(issue);
    expect(page.sequence[0]?.folio).toBe("03");
    expect(page.sequence[0]?.folio).not.toMatch(/https?:\/\//);
    expect(page.cover.meta).not.toMatch(/https?:\/\//);
    expect(page.contents.rows[0]?.folio).not.toMatch(/http/);
    expect(read).not.toMatch(/sheet\.url|piece\.url|lead\.url|opener\.source/);
    expect(read).toMatch(/sheet\.folio/);
    expect(read).toMatch(/className="take"/);
    expect(read).not.toMatch(/kicker">\{take/);
    expect(css).toMatch(/\.take \{/);
    expect(css).toMatch(/border-top:\s*1px solid var\(--ink\)/);
    expect(css).toMatch(/border-bottom:\s*1px solid var\(--ink\)/);
    expect(css).toMatch(/font-style:\s*italic/);
    expect(css).not.toMatch(/\.take[^{]*\{[^}]*2px/);
  });

  it("keeps primary navigation inside Quire", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/<Link to="\/">\{productName\}<\/Link>/);
    expect(read).not.toMatch(/target="_blank"/);
    expect(read).not.toMatch(/href=\{[^}]*url/);
    expect(read).not.toMatch(/window\.open/);
  });

  it("sheets are square paper, not cards", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.sheet \{[\s\S]*border-radius:\s*0/);
    expect(css).toMatch(/\.sheet \{[\s\S]*box-shadow:\s*none/);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*transform:\s*none/);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*box-shadow:\s*none/);
    expect(css).not.toMatch(/rounded-\[28px\]/);
    expect(css).not.toMatch(/mute-pine|#3d5a4c|#2f4f3e/i);
    expect(css).toMatch(/--paper: #f3eee4;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #3d4a3a;/);
  });

  it("photos contain unless Intent already says cover", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(css).toMatch(/\.sheet-figure\.contain img \{[\s\S]*object-fit:\s*contain/);
    expect(css).toMatch(/\.sheet-figure\.cover img \{[\s\S]*object-fit:\s*cover/);
    expect(read).toMatch(/figure\.fit === "cover" \? "sheet-figure cover" : "sheet-figure contain"/);
    const page = composeIssue(issue);
    expect(page.sequence[0]?.figure?.fit).toBe("contain");
  });

  it("omits the cover kicker element when there is no source-owned cover line", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const compose = readFileSync("src/lib/compose.ts", "utf8");
    const page = composeIssue(issue);
    expect(kicker).toBe("A personal press");
    expect(page.cover.kicker).toBeUndefined();
    expect(JSON.stringify(page.cover)).not.toMatch(/A personal press/);
    expect(page.contents.kicker).toBe("In this issue");
    expect(page.cover.masthead).toBe("Quire");
    expect(compose).not.toMatch(/import \{[^}]*\bkicker\b/);
    expect(compose).not.toMatch(/A personal press/);
    expect(read).toMatch(/page\.cover\.kicker \? <p className="kicker">\{page\.cover\.kicker\}<\/p> : null/);
    expect(read).toMatch(/page\.contents\.kicker/);
    expect(read).toMatch(/page\.cover\.masthead/);
    expect(read).not.toMatch(/\bPress\b/);
    expect(read).not.toMatch(/\/clips\/\$/);
  });

  it("does not copy lucide, shadcn, sonner, notes, BindDialog, or a /clips reader", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).not.toMatch(/lucide-react|sonner|@\/components\/ui|BindDialog|notes/);
    expect(read).not.toMatch(/\/clips\/\$/);
    expect(read).not.toMatch(/\bPress\b/);
  });
});
