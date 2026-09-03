import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PageSizes } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { BoundIssue } from "../src/lib/bind";
import { composeIssue } from "../src/lib/compose";
import { composePrint, paperBox, paperNameFor, printPlan } from "../src/lib/print";
import { couldNotPrint, printThisIssue } from "../src/copy";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

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
    },
    {
      url: "https://news.example/one",
      role: "related",
      headline: "A second dispatch",
      paragraphs: ["Another reporter stood on the quay."],
    },
  ],
};

describe("Print this issue", () => {
  it("uses the user-facing name Print this issue, not Press and not PDF", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(printThisIssue).toBe("Print this issue");
    expect(printThisIssue).not.toMatch(/Press|PDF/);
    expect(couldNotPrint).not.toMatch(/Press|PDF/);
    expect(read).toMatch(/printThisIssue/);
    expect(read).toMatch(/\{printThisIssue\}/);
    expect(read).not.toMatch(/\bPress\b/);
    expect(read).not.toMatch(/>PDF</);
    expect(keep).not.toMatch(/printThisIssue|Print this issue|\bPress\b/);
  });

  it("does not ship a /press route or a Press library surface", () => {
    const routes = walk("src/routes");
    const src = walk("src")
      .filter((file) => !file.endsWith(".ttf"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(routes.some((file) => file.includes("press"))).toBe(false);
    expect(existsSync("src/routes/press.tsx")).toBe(false);
    expect(src.includes("/press")).toBe(false);
    expect(src).not.toMatch(/Press library|library of bound issues/);
    expect(readFileSync("src/routeTree.gen.ts", "utf8")).not.toMatch(/\/press/);
  });

  it("prints the bound sequence, original words, and the same Design Intent", () => {
    const page = composeIssue(issue);
    const plan = printPlan(issue);
    expect(plan.papers).toEqual(["a4", "letter"]);
    expect(plan.intent).toEqual(page.intent);
    expect(plan.sheets.map((sheet) => sheet.kind)).toEqual(["cover", "contents", "piece", "piece"]);
    expect(plan.sheets[0]).toMatchObject({
      kind: "cover",
      masthead: "Quire",
      title: "The harbour vote",
    });
    expect(plan.sheets[0] && "kicker" in plan.sheets[0] ? plan.sheets[0].kicker : undefined).toBeUndefined();
    const contents = plan.sheets[1];
    expect(contents?.kind).toBe("contents");
    if (contents?.kind === "contents") {
      expect(contents.kicker).toBe("In this issue");
      expect(contents.folio).toBe("02");
      expect(contents.rows.map((row) => row.folio)).toEqual(["03", "04"]);
    }
    const lead = plan.sheets[2];
    expect(lead?.kind).toBe("piece");
    if (lead?.kind === "piece") {
      expect(lead.paragraphs.join(" ")).toMatch(/assembly met at dusk/);
      expect(lead.take).toBe("A quiet count in Praia.");
      expect(lead.intent).toEqual(page.sequence[0]?.intent);
      expect(lead.folio).toBe("03");
    }
    const related = plan.sheets[3];
    expect(related?.kind).toBe("piece");
    if (related?.kind === "piece") {
      expect(related.paragraphs.join(" ")).toMatch(/Another reporter/);
      expect(related.take).toBeUndefined();
      expect(related.folio).toBe("04");
    }
    expect(JSON.stringify(plan)).not.toMatch(/Inside ·/);
    expect(JSON.stringify(plan)).not.toMatch(/A personal press/);
    expect(JSON.stringify(plan)).not.toMatch(/\bPress\b/);
  });

  it("places an ok take as unlabeled italic, never a Take kicker", async () => {
    const plan = printPlan(issue);
    const lead = plan.sheets.find((sheet) => sheet.kind === "piece");
    expect(lead?.kind).toBe("piece");
    if (lead?.kind === "piece") {
      expect(lead.take).toBe("A quiet count in Praia.");
    }
    const print = readFileSync("src/lib/print.ts", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(print).toMatch(/serifIt/);
    expect(print).not.toMatch(/["']Take["']/);
    expect(print).not.toMatch(/takeLabel/);
    expect(print).not.toMatch(/TL;DR|tl;dr/);
    expect(read).not.toMatch(/takeLabel/);
    expect(read).not.toMatch(/>Take</);

    const missing = printPlan({ ...issue, take: null });
    const bare = missing.sheets.find((sheet) => sheet.kind === "piece");
    expect(bare?.kind).toBe("piece");
    if (bare?.kind === "piece") {
      expect(bare.take).toBeUndefined();
      expect(bare.paragraphs.join(" ")).toMatch(/assembly met at dusk/);
    }
  });

  it("composes A4 and letter with the locked tokens and two families", async () => {
    expect(paperNameFor("en-GB")).toBe("a4");
    expect(paperNameFor("nl-NL")).toBe("a4");
    expect(paperNameFor("en-US")).toBe("letter");
    expect(paperBox("a4")).toEqual(PageSizes.A4);
    expect(paperBox("letter")).toEqual(PageSizes.Letter);

    const a4 = await composePrint(issue, "a4");
    const letter = await composePrint(issue, "letter");
    const a4Doc = await PDFDocument.load(a4);
    const letterDoc = await PDFDocument.load(letter);
    expect(a4Doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(letterDoc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(a4Doc.getPage(0).getSize()).toEqual({ width: PageSizes.A4[0], height: PageSizes.A4[1] });
    expect(letterDoc.getPage(0).getSize()).toEqual({
      width: PageSizes.Letter[0],
      height: PageSizes.Letter[1],
    });

    const compositor = readFileSync("src/lib/print.ts", "utf8");
    expect(compositor).toMatch(/SourceSans3-Regular\.ttf/);
    expect(compositor).toMatch(/SourceSans3-Semibold\.ttf/);
    expect(compositor).toMatch(/SourceSerif4-Regular\.ttf/);
    expect(compositor).toMatch(/SourceSerif4-Italic\.ttf/);
    expect(compositor).not.toMatch(/StandardFonts|Helvetica|Playfair|Fraunces|Inter["']/);
    expect(existsSync("fonts/SourceSans3-Regular.ttf")).toBe(true);
    expect(existsSync("fonts/SourceSerif4-Regular.ttf")).toBe(true);
    expect(existsSync("fonts/SourceSerif4-Italic.ttf")).toBe(true);
  });

  it("sits in stage chrome, not a filled pill on the paper", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const chromeStart = read.indexOf("stage-chrome");
    const wellStart = read.indexOf("stage-well");
    const printAt = read.indexOf("stage-print");
    const sheetAt = read.indexOf('className={sheetClass}');
    expect(chromeStart).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(chromeStart);
    expect(printAt).toBeLessThan(wellStart);
    expect(printAt).toBeLessThan(sheetAt);
    expect(read).toMatch(/<nav className="stage-chrome">/);
    expect(read).toMatch(/className="stage-print"/);
    expect(read).not.toMatch(/className="sheet[^"]*"[^>]*>[\s\S]*stage-print/);
    expect(css).toMatch(/\.stage-print \{[\s\S]*background:\s*transparent/);
    expect(css).not.toMatch(/\.sheet[^{]*\{[^}]*\.stage-print/);
    expect(css).not.toMatch(/\.sheet[\s\S]{0,200}button \{[\s\S]{0,80}background:\s*var\(--binding\)/);
  });

  it("does not restyle Select, SI, or add a third font / flipbook export", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const pkg = readFileSync("package.json", "utf8");
    const families = [...root.matchAll(/family=([^:&]+)/g)].map((match) => match[1]);
    expect(keep).toMatch(/className="site-masthead"/);
    expect(keep).toMatch(/className="keep"/);
    expect(keep).toMatch(/createIssueLabel/);
    expect(keep).not.toMatch(/printThisIssue|className="stage"/);
    expect(css).toMatch(/--paper: #f3eee4;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #3d4a3a;/);
    expect(families).toEqual(["Source+Sans+3", "Source+Serif+4"]);
    expect(pkg).toMatch(/"pdf-lib"/);
    expect(pkg).not.toMatch(/pdfjs|react-pdf|page-flip|stpageflip|react-pageflip|issuu/i);
    expect(keep).not.toMatch(/getClipIntelligenceState|\/reliability/);
    const save = readFileSync("src/lib/save.ts", "utf8");
    expect(save).toMatch(/store\.insert\(/);
    expect(save).toMatch(/persistUnderstanding/);
    expect(save).toMatch(/persistRelated/);
    expect(save).toMatch(/persistSourceHeadline/);
  });
});
