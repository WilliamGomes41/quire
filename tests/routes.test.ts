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
    expect(read).toMatch(/takeLabel/);
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
    expect(keep).toMatch(/<h3 className="display">\{heading\}<\/h3>/);
    expect(keep).toMatch(/hostnameOf\(clip\.url\)/);
    expect(keep).not.toMatch(/to=["']\/clips\/\$clipId["']/);
    expect(keep).not.toMatch(/\/clips\/\$/);
  });

  it("keeps Source as a separate control", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/className="source"/);
    expect(keep).toMatch(/sourceLabel/);
    expect(keep).toMatch(/href=\{clip\.url\}/);
    expect(keep).toMatch(/target="_blank"/);
    const sourceControl = keep.match(
      /<a className="source" href=\{clip\.url\} target="_blank" rel="noreferrer">\s*\{sourceLabel\}\s*<\/a>/,
    );
    expect(sourceControl).not.toBeNull();
  });

  it("shows a paper badge only from an ok understanding", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/paperBadgeLabel\(clip\.understanding\)/);
    expect(keep).toMatch(/\{badge \? <span className="badge">\{badge\}<\/span> : null\}/);
  });

  it("keeps related titles as checkboxes, not off-site links", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/type="checkbox"/);
    expect(keep).toMatch(/relatedRow\(page\)/);
    expect(keep).toMatch(/<span>\{row\.title\}<\/span>/);
    expect(keep).toMatch(/row\.host/);
    expect(keep).toMatch(/row\.snippet/);
    expect(keep).not.toMatch(/<a href=\{page\.url\}/);
    expect(keep).not.toMatch(/href=\{page\.url\}/);
  });

  it("shows the stored related snippet and host on the Select row", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/\{row\.host \? <span className="folio">\{row\.host\}<\/span> : null\}/);
    expect(keep).toMatch(/\{row\.snippet \? <span className="note">\{row\.snippet\}<\/span> : null\}/);
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

  it("keeps the Select board as two-column paper tiles on a wide viewport", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/@media \(min-width: 48rem\) \{[\s\S]*\.cards \{[\s\S]*grid-template-columns: 1fr 1fr;/);
    expect(css).toMatch(/main:has\(> \.board\) \{[\s\S]*max-width: 68rem;/);
    expect(css).toMatch(/main:has\(> \.board\) > :not\(\.board\) \{[\s\S]*max-width: 36rem;/);
    expect(css).toMatch(/--paper: #f3eee4;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #3d4a3a;/);
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
    expect(css).toMatch(/--paper: #f3eee4;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #3d4a3a;/);
  });

  it("lets Keep show pending so mashed clicks do not duplicate", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/if \(keeping\) return;/);
    expect(keep).toMatch(/disabled=\{keeping\}/);
    expect(keep).toMatch(/Keeping…/);
  });
});
