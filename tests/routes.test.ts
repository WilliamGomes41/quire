import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("PR 4 surface", () => {
  it("does not ship a user-facing Press route or nav", () => {
    const files = walk("src");
    const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(text.includes("/press")).toBe(false);
    const routes = walk("src/routes");
    const routeText = routes.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(routeText).not.toMatch(/\bPress\b/);
    expect(routes.some((file) => file.includes("press"))).toBe(false);
  });

  it("ships Select → Create issue → Read and no Press tab", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(keep).toMatch(/createIssueLabel/);
    expect(keep).toMatch(/includeOriginal/);
    expect(keep).toMatch(/\/read\/\$id/);
    expect(keep).not.toMatch(/web_search/);
    expect(read).toMatch(/composeIssue/);
    expect(read).toMatch(/issueFromKeptWords/);
    expect(read).toMatch(/clipStore/);
    expect(read).toMatch(/data-sheet=\{kind\}/);
    expect(read).toMatch(/sheet-cover/);
    expect(read).toMatch(/sheet-contents/);
    expect(read).toMatch(/sheet-piece/);
    expect(read).toMatch(/page\.cover\.kicker \? <p className="kicker">\{page\.cover\.kicker\}<\/p> : null/);
    expect(read).toMatch(/page\.contents\.kicker/);
    expect(read).not.toMatch(/takeLabel/);
    expect(read).not.toMatch(/className="opener"/);
    expect(read).not.toMatch(/className="aside"/);
    expect(read).not.toMatch(/TL;DR|tl;dr|Press/);
  });

  it("does not bind Keep to an owner session", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const save = readFileSync("src/lib/save.ts", "utf8");
    const bind = readFileSync("src/lib/bind.ts", "utf8");
    expect(keep).not.toMatch(/getSession|requireOwner|auth\.api/);
    expect(save).not.toMatch(/ownerId|userId/);
    expect(bind).not.toMatch(/ownerId|userId/);
  });

  it("does not map protocol terms to a class tree", () => {
    const text = walk("src/lib")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(text).not.toMatch(/class Understanding/);
    expect(text).not.toMatch(/class KeepUnderstanding/);
    expect(text).not.toMatch(/class SearchProvider/);
    expect(text).not.toMatch(/class Brave/);
    expect(text).not.toMatch(/class RelatedReporting/);
    expect(text).not.toMatch(/class Issue\b/);
    expect(text).not.toMatch(/class ArtDirector/);
    expect(text).not.toMatch(/class Magazine/);
    expect(text).not.toMatch(/class Bind\b/);
    expect(text).not.toMatch(/class CharacterizationBadge/);
    expect(text).not.toMatch(/class ClipCard/);
  });
});

describe("kept card does not leak to the source", () => {
  it("does not use clip.url as the primary heading link", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).not.toMatch(/<a href=\{clip\.url\}>\{clip\.url\}<\/a>/);
    expect(keep).toMatch(/keptHeading\(clip\)/);
    expect(keep).toMatch(/<Link to="\/read\/\$id" params=\{\{ id: clip\.id \}\}>/);
    expect(keep).not.toMatch(/to=["']\/clips\/\$clipId["']/);
    expect(keep).not.toMatch(/\/clips\/\$/);
  });

  it("makes Source the one leaving control, not a host prefix on the headline", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/className="source"/);
    expect(keep).toMatch(/sourceLabel/);
    expect(keep).toMatch(/href=\{clip\.url\}/);
    expect(keep).toMatch(/target="_blank"/);
    expect(keep).not.toMatch(/<span className="source">/);
    expect(keep).not.toMatch(/host && topic/);
  });

  it("does not put COMMENT or type badges on the board", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).not.toMatch(/paperBadgeLabel/);
    expect(keep).not.toMatch(/className="badge"/);
    expect(keep).not.toMatch(/\bCOMMENT\b/);
  });

  it("keeps related titles as quiet include, not off-site links or Read", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).not.toMatch(/type="checkbox"/);
    expect(keep).toMatch(/relatedRow\(page\)/);
    expect(keep).toMatch(/<span>\{row\.title\}<\/span>/);
    expect(keep).toMatch(/inLabel/);
    expect(keep).not.toMatch(/<a href=\{page\.url\}/);
    expect(keep).not.toMatch(/href=\{page\.url\}/);
    expect(keep).not.toMatch(/to="\/read\/\$id" params=\{\{ id: page/);
  });

  it("shows the stored related snippet, or publisher · date when there is no snippet", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/\{row\.snippet \? <span className="note">\{row\.snippet\}<\/span> : null\}/);
    expect(keep).toMatch(/\{row\.detail \? <span className="folio">\{row\.detail\}<\/span> : null\}/);
    expect(keep).not.toMatch(/runRelatedReporting|searchPages\(\{ query/);
  });

  it("puts Remove on each kept card and invalidates home", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/removeLabel/);
    expect(keep).toMatch(/removeKept/);
    expect(keep).toMatch(/store\.remove\(data\.id\)/);
    expect(keep).toMatch(/type="button"/);
    expect(keep).toMatch(/className="quiet"/);
    expect(keep).toMatch(/removeKept\(\{ data: \{ id: clip\.id \} \}\)\.then\(\(\) => router\.invalidate\(\)\)/);
    expect(keep).not.toMatch(/lucide-react|Trash2|sonner/);
  });

  it("puts quiet Remove on each bound-issue card and asks about the pieces", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/BoundCover/);
    expect(keep).toMatch(/removeBound/);
    expect(keep).toMatch(/deleteBoundIssue/);
    expect(keep).toMatch(/takeBoundOffDesk/);
    expect(keep).toMatch(/returnToDeskLabel/);
    expect(keep).toMatch(/removePiecesTooLabel/);
    expect(keep).toMatch(/removeIssueAsk/);
    expect(keep).toMatch(/className="quiet"/);
    expect(keep).toMatch(
      /removeBound\(\{ data: \{ id: issue\.id, pieces \} \}\)\.then\(\(\) => router\.invalidate\(\)\)/,
    );
    expect(keep).not.toMatch(/lucide-react|Trash2|sonner|AlertDialog/);
    expect(keep).not.toMatch(/\/clips\/\$/);
    expect(keep).not.toMatch(/\bPress\b/);
  });

  it("uses one Create issue for the board and does not bind an empty selection", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep.match(/createIssueLabel/g)?.length).toBe(2);
    expect(keep).toMatch(/chosenFromBoard\(board\)/);
    expect(keep).toMatch(/chosenPieces\(clip, choice\)/);
    expect(keep).toMatch(/nothingSelected/);
    expect(keep).toMatch(/selections:/);
    expect(keep).not.toMatch(/onBind/);
    expect(keep).toMatch(/\/read\/\$id/);
  });

  it("lets the headline open Read on this keep, and In is not the title", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/to="\/read\/\$id"/);
    expect(keep).toMatch(/params=\{\{ id: clip\.id \}\}/);
    expect(keep).toMatch(/inLabel/);
    expect(keep).toMatch(/className="include"/);
    expect(keep).toMatch(/includeOriginal/);
    expect(keep).toMatch(/onToggle/);
    expect(keep).not.toMatch(/className="choice include"/);
    expect(keep).not.toMatch(/type="checkbox"/);
    expect(keep).toMatch(/href=\{clip\.url\}/);
    expect(keep).not.toMatch(/href=\{page\.url\}/);
    expect(keep).toMatch(/keptFigure\(clip\.sourceHeadline\)/);
    expect(keep).toMatch(/figure \?/);
    expect(keep).not.toMatch(/fetchOg|ogImage/);
    expect(keep).not.toMatch(/<details|<summary/);
  });

  it("hides the Select sermons on the tiles", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).not.toMatch(/selectLine|originalInByDefault|suggestionsUntilSelected|relatedJoinWhenSelected/);
  });

  it("keeps the Select board as two-column paper tiles on a wide viewport", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/@media \(min-width: 48rem\) \{[\s\S]*\.cards \{[\s\S]*grid-template-columns: 1fr 1fr;/);
    expect(css).toMatch(/main:has\(> \.board\) \{[\s\S]*max-width: 68rem;/);
    expect(css).toMatch(/main:has\(> \.board\) > \.site \{[\s\S]*max-width: none;/);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
  });

  it("does not fetch OG images as a second Keep pass", () => {
    const save = readFileSync("src/lib/save.ts", "utf8");
    const headline = readFileSync("src/lib/source-headline.ts", "utf8");
    expect(save).toMatch(/persistSourceHeadline/);
    expect(save).not.toMatch(/fetchArticleWords/);
    expect(headline).toMatch(/og:image/);
    expect(headline).not.toMatch(/fetchOg|downloadImage/);
  });

  it("does not add a Desk /clips/$id reader or a Press route", () => {
    const routes = walk("src/routes");
    expect(routes.some((file) => file.includes("clips"))).toBe(false);
    expect(routes.some((file) => file.includes("press"))).toBe(false);
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(tree).not.toMatch(/\/clips\/\$/);
    expect(tree).not.toMatch(/\/press/);
    expect(tree).toMatch(/\/read\/\$id/);
  });

  it("does not copy lucide, shadcn, sonner, notes, delete, or mute-pine", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    expect(keep).not.toMatch(/lucide-react|sonner|@\/components\/ui|TopicRail|ExternalLink|Trash2/);
    expect(css).not.toMatch(/mute-pine|#3d5a4c|#2f4f3e/i);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
  });

  it("lets Keep show pending so mashed clicks do not duplicate", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/if \(keeping\) return;/);
    expect(keep).toMatch(/disabled=\{keeping\}/);
    expect(keep).toMatch(/Keeping…/);
  });
});
