import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pressCoverMeta, pressEmpty, pressLabel, printThisIssue } from "../src/copy";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function remSize(block: string) {
  return Number(/font-size:\s*([\d.]+)rem/.exec(block)?.[1]);
}

describe("Press is the library of bound issues", () => {
  it("names the home shelf Press, not readLine", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const copy = readFileSync("src/copy.ts", "utf8");
    expect(pressLabel).toBe("Press");
    expect(keep).toMatch(/className="board press"/);
    expect(keep).toMatch(/<h2>\{pressLabel\}<\/h2>/);
    expect(keep).not.toMatch(/readLine/);
    expect(keep).not.toMatch(/Read the bound issue/);
    expect(copy).not.toMatch(/readLine/);
    expect(copy).not.toMatch(/Read the bound issue/);
  });

  it("keeps empty Press as empty-library copy, not a fail", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const press = keep.slice(keep.indexOf('className="board press"'));
    expect(pressEmpty).toMatch(/library/i);
    expect(pressEmpty).not.toMatch(/Could not|fail/i);
    expect(pressEmpty).not.toMatch(/Create the issue/);
    expect(press).toMatch(/className="empty">\{pressEmpty\}/);
    expect(press).not.toMatch(/className="fail">\{pressEmpty\}/);
    expect(press).not.toMatch(/boundEmpty|readLine/);
  });

  it("opens covers on the existing Read sheet and leaves Print on stage chrome", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const cover = keep.slice(keep.indexOf("function BoundCover"), keep.indexOf("function BindCard"));
    expect(cover).toMatch(/<Link className="cover" to="\/read\/\$id" params=\{\{ id: issue\.id \}\}>/);
    expect(cover).toMatch(/pressCoverMeta\(issue\)/);
    expect(cover).toMatch(/removeLabel/);
    expect(cover).toMatch(/className="quiet"/);
    expect(cover).not.toMatch(/printThisIssue|Print this issue|window\.print|printIssue/);
    expect(keep).not.toMatch(/printThisIssue|Print this issue/);
    expect(printThisIssue).toBe("Print this issue");
    expect(read).toMatch(/printThisIssue/);
    expect(read).toMatch(/className="stage-print"/);
    expect(read).not.toMatch(/\bPress\b/);
  });

  it("makes covers a stacked shelf, not Keep-card twins", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const cover = keep.slice(keep.indexOf("function BoundCover"), keep.indexOf("function BindCard"));
    const title = css.match(/\.cover \.display \{([^}]+)\}/)?.[1] ?? "";
    const meta = css.match(/\.cover \.folio \{([^}]+)\}/)?.[1] ?? "";
    const shelf = css.match(/\.covers \{([^}]+)\}/)?.[1] ?? "";
    const size = remSize(title);

    expect(cover).toMatch(/className="display"/);
    expect(cover).toMatch(/\{issue\.title\}/);
    expect(cover).toMatch(/className="folio"/);
    expect(cover).not.toMatch(/paperBadgeLabel|className="badge"|data-mark/);
    expect(cover).not.toMatch(/className="include"|inLabel|aria-pressed/);
    expect(cover).not.toMatch(/type="checkbox"/);
    expect(cover).not.toMatch(/keptHeading|keptSnippet|keptFigure|className="card"/);
    expect(cover).not.toMatch(/kicker|>Issue</);
    expect(title).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(title).toMatch(/font-weight:\s*600/);
    expect(size).toBeGreaterThanOrEqual(1.5);
    expect(size).toBeLessThanOrEqual(2.2);
    expect(meta).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(meta).toMatch(/text-transform:\s*none/);
    expect(shelf).toMatch(/grid-template-columns:\s*1fr/);
    expect(shelf).not.toMatch(/1fr 1fr/);
    expect(css).toMatch(/@media \(min-width: 48rem\) \{[\s\S]*\.cards \{[\s\S]*grid-template-columns: 1fr 1fr;/);
    expect(css).not.toMatch(/@media \(min-width: 48rem\) \{[\s\S]*\.covers \{[\s\S]*1fr 1fr/);
    expect(pressCoverMeta({ createdAt: "2026-09-01T00:00:00.000Z", pieces: { length: 1 } })).toBe(
      "One piece · 2026-09-01",
    );
    expect(pressCoverMeta({ createdAt: "2026-09-03T12:00:00.000Z", pieces: { length: 3 } })).toBe(
      "3 pieces · 2026-09-03",
    );
  });

  it("does not add a /press route or a Press tab", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    const routes = walk("src/routes");
    const nav = keep.match(/<nav>[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav).not.toMatch(/\bPress\b/);
    expect(nav).not.toMatch(/\/press/);
    expect(keep).not.toMatch(/to=["']\/press["']/);
    expect(routes.some((file) => file.includes("press"))).toBe(false);
    expect(existsSync("src/routes/press.tsx")).toBe(false);
    expect(tree).not.toMatch(/\/press/);
    expect(tree).toMatch(/\/read\/\$id/);
  });

  it("keeps pass 2 tokens, no Read sheet hover-lift, no Issuu or third font", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const pkg = readFileSync("package.json", "utf8");
    const families = [...root.matchAll(/family=([^:&]+)/g)].map((match) => match[1]);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
    expect(css).not.toMatch(/#f3eee4|#3d4a3a|#ffffff|#161513/i);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*transform:\s*none/);
    expect(css).not.toMatch(/\.sheet:hover \{[^}]*translateY/);
    expect(css).toMatch(/\.card:hover,\s*\.covers \.cover:hover \{[\s\S]*translateY\(-3px\)/);
    expect(families).toEqual(["Source+Sans+3", "Source+Serif+4"]);
    expect(keep).not.toMatch(/lucide-react|issuu|sonner|Trash2/i);
    expect(pkg).not.toMatch(/issuu|page-flip|stpageflip|react-pageflip|lucide/i);
  });

  it("leaves Keep, Create issue, and characterization on the pile", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const press = keep.slice(keep.indexOf('className="board press"'), keep.indexOf("function BoundCover"));
    expect(keep).toMatch(/className="keep"/);
    expect(keep).toMatch(/keeping \? "Keeping…" : "Keep"/);
    expect(keep.match(/createIssueLabel/g)?.length).toBe(2);
    expect(keep).toMatch(/nothingSelected/);
    expect(keep).toMatch(/Creating…/);
    expect(keep).toMatch(/paperBadgeLabel\(clip\.understanding\)/);
    expect(keep).toMatch(/relatedCollapsed\(pages, selected\)/);
    expect(press).not.toMatch(/createIssueLabel|paperBadgeLabel|className="include"/);
  });
});
