import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function remSize(block: string) {
  return Number(/font-size:\s*([\d.]+)rem/.exec(block)?.[1]);
}

describe("Keep / Select press board", () => {
  it("sets the tile heading in Source Serif at board scale, not cover display", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const tile = css.match(/\.card \.display \{([^}]+)\}/)?.[1] ?? "";
    const size = remSize(tile);

    expect(keep).toMatch(/keptHeading\(clip\)/);
    expect(keep).toMatch(/<h3 className="display">\{heading\}<\/h3>/);
    expect(tile).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(size).toBeGreaterThanOrEqual(1.5);
    expect(size).toBeLessThanOrEqual(2.2);
    expect(tile).not.toMatch(/(?:^|[^\d.])(?:[4-7](?:\.\d+)?)rem/);
    expect(css).toMatch(/\.masthead \{[\s\S]*font-size:\s*clamp\(3\.25rem/);
    expect(css).not.toMatch(/\.card \.display \{[^}]*(?:^|[^\d.])(?:[4-7](?:\.\d+)?)rem/);
  });

  it("keeps related as checkbox + title + snippet, not off-site links", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/type="checkbox"/);
    expect(keep).toMatch(/relatedRow\(page\)/);
    expect(keep).toMatch(/<span>\{row\.title\}<\/span>/);
    expect(keep).toMatch(/\{row\.snippet \? <span className="note">\{row\.snippet\}<\/span> : null\}/);
    expect(keep).not.toMatch(/href=\{page\.url\}/);
    expect(keep).not.toMatch(/href=\{clip\.url\}/);
    expect(keep).not.toMatch(/target="_blank"/);
  });

  it("makes Keep one paste, not a form stack", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    expect(keep).toMatch(/className="keep"/);
    expect(keep).toMatch(/aria-label="URL"/);
    expect(keep).not.toMatch(/<label htmlFor="url">/);
    expect(keep).not.toMatch(/>URL</);
    expect(css).toMatch(/form\.keep \{[\s\S]*display:\s*flex/);
    expect(css).toMatch(/form\.keep \{[\s\S]*max-width:\s*28rem/);
  });

  it("uses a modest Source Serif site masthead, smaller than the Read cover", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const site = css.match(/\.site-masthead \{([^}]+)\}/)?.[1] ?? "";
    const siteSize = remSize(site);

    expect(keep).toMatch(/className="site-masthead"/);
    expect(site).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(siteSize).toBeGreaterThan(1);
    expect(siteSize).toBeLessThan(3.25);
    expect(css).toMatch(/\.masthead \{[\s\S]*font-size:\s*clamp\(3\.25rem,\s*9vw,\s*5rem\)/);
  });

  it("contains stored photos and puts the snippet under the title", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const figure = css.match(/\.card \.figure img \{([^}]+)\}/)?.[1] ?? "";
    expect(keep).toMatch(/keptFigure\(clip\.sourceHeadline\)/);
    expect(keep).toMatch(/keptSnippet\(clip\.sourceHeadline\)/);
    expect(keep).toMatch(/\{snippet \? <p className="note">\{snippet\}<\/p> : null\}/);
    expect(figure).toMatch(/object-fit:\s*contain/);
    expect(figure).not.toMatch(/object-fit:\s*cover/);
  });

  it("does not put a dark stage or floating sheet on Keep / Select", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    expect(keep).not.toMatch(/className="stage"/);
    expect(keep).not.toMatch(/className="sheet"/);
    expect(css).toMatch(/html,\s*body \{[\s\S]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/\.card,[\s\S]*\.cover \{[\s\S]*box-shadow:\s*none/);
    expect(css).toMatch(/html:has\(\.stage\),[\s\S]*body:has\(\.stage\) \{[\s\S]*var\(--binding\)/);
  });

  it("keeps Read as cloth + one sheet and does not start Print", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(read).toMatch(/className="stage"/);
    expect(read.match(/<article/g)?.length).toBe(1);
    expect(css).toMatch(/\.stage \{[\s\S]*var\(--binding\)/);
    expect(css).toMatch(/\.sheet \{[\s\S]*background: var\(--paper\)/);
    expect(keep).not.toMatch(/Print this issue|window\.print|printIssue/);
    expect(read).not.toMatch(/Print this issue|window\.print|printIssue/);
  });

  it("keeps two families only, locked tokens, and no Press or /clips", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const families = [...root.matchAll(/family=([^:&]+)/g)].map((match) => match[1]);
    expect(families).toEqual(["Source+Sans+3", "Source+Serif+4"]);
    expect(css).toMatch(/--font-sans:\s*"Source Sans 3"/);
    expect(css).toMatch(/--font-serif:\s*"Source Serif 4"/);
    expect(css).toMatch(/--paper: #f3eee4;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #3d4a3a;/);
    expect(css).not.toMatch(/Playfair|Fraunces|Newsreader|Instrument|Cormorant|Libre Baskerville|IBM Plex|Inter["']/);
    expect(keep).not.toMatch(/\/clips\/\$/);
    expect(keep).not.toMatch(/\bPress\b/);
    expect(keep).not.toMatch(/lucide-react|sonner|Trash2/);
  });

  it("keeps one Create issue, quiet Remove, and fail-closed headline persist", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const save = readFileSync("src/lib/save.ts", "utf8");
    expect(keep.match(/createIssueLabel/g)?.length).toBe(2);
    expect(keep).toMatch(/chosenFromBoard\(board\)/);
    expect(keep).toMatch(/nothingSelected/);
    expect(keep).toMatch(/className="quiet"/);
    expect(keep).toMatch(/removeLabel/);
    expect(keep).toMatch(/<span className="source">\{host \|\| sourceLabel\}<\/span>/);
    expect(save).toMatch(/persistSourceHeadline/);
    expect(save).toMatch(/store\.insert\(/);
  });
});
