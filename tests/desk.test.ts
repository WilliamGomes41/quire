import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("home desk composition", () => {
  it("puts Keep paste as a left rail and Select board to the right", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const home = keep.slice(keep.indexOf("function Home"), keep.indexOf("function BoundCover"));
    const desk = home.slice(home.indexOf('className="desk"'), home.indexOf('className="board press"'));

    expect(home).toMatch(/className="desk"/);
    expect(home).toMatch(/className="keep-rail"/);
    expect(desk.indexOf("keep-rail")).toBeGreaterThan(-1);
    expect(desk.indexOf("keep-rail")).toBeLessThan(desk.indexOf('className="board"'));
    expect(desk.indexOf('className="keep"')).toBeLessThan(desk.indexOf('className="board"'));
    expect(desk).toMatch(/className="cards"/);
    expect(desk).toMatch(/createIssueLabel/);
    expect(home.indexOf('className="desk"')).toBeLessThan(home.indexOf('className="board press"'));
    expect(css).toMatch(/\.desk \{[\s\S]*display:\s*grid/);
    expect(css).toMatch(
      /@media \(min-width: 48rem\) \{[\s\S]*\.desk \{[\s\S]*grid-template-columns:\s*minmax\(12rem, 16rem\) minmax\(0, 1fr\)/,
    );
    expect(css).not.toMatch(/grid-template-columns:\s*16rem 1fr 1fr|320px|24px 40px/);
  });

  it("lets a stored figure lead the keep card and does not invent images", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const card = keep.slice(keep.indexOf("function BindCard"), keep.indexOf("function UnderstandingFail"));
    expect(card).toMatch(/keptFigure\(clip\.sourceHeadline\)/);
    expect(card).toMatch(/figure \? "photo"/);
    expect(card).toMatch(/figure \? \(/);
    expect(card.indexOf("keptFigure")).toBeLessThan(card.indexOf('className="display"'));
    expect(card.indexOf('className="figure"')).toBeLessThan(card.indexOf("<header>"));
    expect(card).not.toMatch(/fetchOg|ogImage|unsplash|picsum|placeholder/i);
    expect(keep).not.toMatch(/>Image</);
    expect(css).toMatch(/\.card \.figure img \{[\s\S]*object-fit:\s*contain/);
    expect(css).toMatch(/\.card\.photo \.figure \{[\s\S]*order:\s*-1/);
  });

  it("does not ship mock desk copy, photo include, or a publisher chip", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const copy = readFileSync("src/copy.ts", "utf8");
    const card = keep.slice(keep.indexOf("function BindCard"), keep.indexOf("function UnderstandingFail"));
    const figure = card.slice(card.indexOf("figure ?"), card.indexOf("<header>"));
    const header = card.slice(card.indexOf("<header>"), card.indexOf("</header>"));
    expect(keep).not.toMatch(/Keep Piece|Keep a URL|Paste link here|Create New Issue|Select Board|items pending/i);
    expect(keep).not.toMatch(/QUIRE PRESS|MANIFESTO|\bEXPORT\b/);
    expect(copy).not.toMatch(/Keep Piece|Create New Issue|Select Board|items pending/i);
    expect(figure).not.toMatch(/className="include"|aria-pressed|inLabel/);
    expect(header).toMatch(/className="badge"/);
    expect(header).not.toMatch(/className="source"|hostnameOf|host/);
    expect(card).toMatch(/className="include"/);
    expect(card).toMatch(/className="source"/);
    expect(card).toMatch(/href=\{clip\.url\}/);
    expect(keep).not.toMatch(/Issue 04|12 PCS|Winter 2024|Fall 2023/);
  });

  it("keeps Press as a stacked shelf and one Create issue", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const press = keep.slice(keep.indexOf('className="board press"'), keep.indexOf("function BoundCover"));
    const cover = keep.slice(keep.indexOf("function BoundCover"), keep.indexOf("function BindCard"));
    expect(press).toMatch(/<h2>\{pressLabel\}<\/h2>/);
    expect(press).toMatch(/className="covers"/);
    expect(press).not.toMatch(/createIssueLabel|paperBadgeLabel|className="include"/);
    expect(cover).toMatch(/pressCoverMeta\(issue\)/);
    expect(cover).not.toMatch(/Issue 04|12 PCS|Winter|season|kicker/);
    expect(cover).not.toMatch(/className="include"|paperBadgeLabel|className="badge"/);
    expect(keep.match(/createIssueLabel/g)?.length).toBe(2);
    expect(keep).toMatch(/nothingSelected/);
    expect(css).toMatch(/\.covers \{[\s\S]*grid-template-columns:\s*1fr/);
    expect(css).not.toMatch(/@media \(min-width: 48rem\) \{[\s\S]*\.covers \{[\s\S]*1fr 1fr/);
  });

  it("leaves related collapse, Opinion marks, and Read cloth + one sheet", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const families = [...root.matchAll(/family=([^:&]+)/g)].map((match) => match[1]);
    expect(keep).toMatch(/moreOnThisTopic/);
    expect(keep).toMatch(/relatedCollapsed\(pages, selected\)/);
    expect(keep).toMatch(/const \[open, setOpen\] = useState\(false\)/);
    expect(keep).toMatch(/paperBadgeLabel\(clip\.understanding\)/);
    expect(css).toMatch(/\.badge\[data-mark="Opinion"\]/);
    expect(css).not.toMatch(/data-mark="Comment"/);
    expect(read).toMatch(/className="stage"/);
    expect(read.match(/<article/g)?.length).toBe(1);
    expect(read).toMatch(/className="stage-print"/);
    expect(read).toMatch(/printThisIssue/);
    expect(read).not.toMatch(/lucide-react|< PREVIOUS|FOLIO 12|printer icon/i);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*transform:\s*none/);
    expect(css).not.toMatch(/\.sheet:hover \{[^}]*translateY/);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
    expect(families).toEqual(["Source+Sans+3", "Source+Serif+4"]);
  });

  it("does not add a /press route, Press tab, or third font", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    const routes = walk("src/routes");
    const nav = keep.match(/<nav>[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav).not.toMatch(/\bPress\b/);
    expect(keep).not.toMatch(/to=["']\/press["']/);
    expect(routes.some((file) => file.includes("press"))).toBe(false);
    expect(existsSync("src/routes/press.tsx")).toBe(false);
    expect(tree).not.toMatch(/\/press/);
    expect(keep).not.toMatch(/lucide-react|issuu|Playfair|Inter["']/i);
  });
});
