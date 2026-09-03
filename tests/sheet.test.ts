import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeIssue, nextSheetIndex, pieceSheetIndex, readingSheets } from "../src/lib/compose";
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
    expect(read).toMatch(/data-sheet=\{kind\}/);
    expect(read).toMatch(/sheet-cover/);
    expect(read).toMatch(/sheet-contents/);
    expect(read).toMatch(/sheet-piece/);
    expect(read).toMatch(/readingSheets\(page\)/);
    expect(read).toMatch(/current\?\.kind === "cover"/);
    expect(read).toMatch(/current\?\.kind === "contents"/);
    expect(read).toMatch(/piece \? <PieceSheet/);
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
    expect(read).not.toMatch(/Inside ·/);
    expect(read).not.toMatch(/Inside/);
    expect(read).toMatch(/printThisIssue/);
    expect(read).toMatch(/className="stage-print"/);
    expect(read).not.toMatch(/window\.print|printIssue/);
  });

  it("does not print a Take kicker or a raw source URL as the folio", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const page = composeIssue(issue);
    expect(page.sequence[0]?.folio).toBe("03");
    expect(page.contents.folio).toBe("02");
    expect(page.sequence[0]?.folio).toMatch(/^\d+$/);
    expect(page.contents.folio).toMatch(/^\d+$/);
    expect(page.contents.rows[0]?.folio).toMatch(/^\d+$/);
    expect(page.sequence[0]?.folio).not.toMatch(/https?:\/\//);
    expect(page.cover.meta).not.toMatch(/https?:\/\//);
    expect(page.contents.rows[0]?.folio).not.toMatch(/http/);
    expect(read).not.toMatch(/folio">Contents</);
    expect(read).toMatch(/page\.contents\.folio/);
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

  it("Read is one sheet at a time on a binding-cloth stage", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const page = composeIssue(issue);
    expect(readingSheets(page).map((sheet) => sheet.kind)).toEqual(["cover", "contents", "piece"]);
    expect(read).toMatch(/className="stage"/);
    expect(read).toMatch(/className="stage-chrome"/);
    expect(read).toMatch(/className="stage-well"/);
    expect(read).not.toMatch(/className="sheets"/);
    expect(read).not.toMatch(/className="spread"/);
    expect(read).not.toMatch(/className="page issue"/);
    expect(css).toMatch(/\.stage \{[\s\S]*var\(--binding\)/);
    expect(css).toMatch(/\.stage \{[\s\S]*var\(--ink\)/);
    expect(css).not.toMatch(/\.stage \{[\s\S]*#000/);
    expect(css).not.toMatch(/\.stage \{[\s\S]*#111/);
    expect(css).not.toMatch(/wood|#5c4033|#8b5a2b|#3e2723/i);
    expect(css).toMatch(/\.sheet \{[\s\S]*background: var\(--paper\)/);
    expect(css).toMatch(/\.sheet \{[\s\S]*border-radius:\s*0/);
    expect(css).toMatch(/\.sheet \{[\s\S]*box-shadow: 0 10px 28px/);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*transform:\s*none/);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*box-shadow: 0 10px 28px/);
    expect(css).not.toMatch(/page-curl|perspective|rotateY|flip-book|page-flip/i);
    expect(css).not.toMatch(/\.sheet:hover \{[^}]*translateY/);
    expect(css).not.toMatch(/rounded-\[28px\]/);
    expect(css).not.toMatch(/mute-pine|#3d5a4c|#2f4f3e/i);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
    expect(keep).not.toMatch(/className="stage"/);
    expect(keep).toMatch(/className="card/);
  });

  it("keeps app chrome on the stage, not on the paper", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/<nav className="stage-chrome">/);
    expect(read).toMatch(/<Link to="\/">\{productName\}<\/Link>/);
    expect(read.indexOf("stage-chrome")).toBeLessThan(read.indexOf("stage-well"));
    expect(read).not.toMatch(/<nav className="issue-nav">/);
    expect(read).not.toMatch(/className="sheet[^"]*"[^>]*>[\s\S]*stage-chrome/);
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

  it("sets sheet type: Serif body in band, Sans chrome, no third font, no Inside ·", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const save = readFileSync("src/lib/save.ts", "utf8");
    const page = composeIssue(issue);
    const body = css.match(/\.piece-body \{([^}]+)\}/)?.[1] ?? "";
    const size = Number(/font-size:\s*([\d.]+)px/.exec(body)?.[1]);
    const leading = Number(/line-height:\s*([\d.]+)/.exec(body)?.[1]);
    const measure = Number(/max-width:\s*([\d.]+)ch/.exec(body)?.[1]);
    const families = [...root.matchAll(/family=([^:&]+)/g)].map((match) => match[1]);

    expect(css).toMatch(/--font-serif:\s*"Source Serif 4"/);
    expect(css).toMatch(/--font-sans:\s*"Source Sans 3"/);
    expect(body).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(size).toBeGreaterThanOrEqual(16);
    expect(size).toBeLessThanOrEqual(18);
    expect(leading).toBeGreaterThanOrEqual(1.65);
    expect(leading).toBeLessThanOrEqual(1.7);
    expect(measure).toBeGreaterThanOrEqual(45);
    expect(measure).toBeLessThanOrEqual(75);

    expect(css).toMatch(/\.running-head[\s\S]*?font-family:\s*var\(--font-sans\)/);
    expect(css).toMatch(/\.sheet \.folio \{[\s\S]*?font-family:\s*var\(--font-sans\)/);
    expect(css).toMatch(/\.kicker \{[\s\S]*?font-family:\s*var\(--font-sans\)/);
    expect(css).toMatch(/\.sheet-cover h1 \{[\s\S]*font-family:\s*var\(--font-serif\)/);
    expect(css).toMatch(/\.sheet-cover h1 \{[\s\S]*font-weight:\s*600/);
    expect(css).toMatch(/\.sheet-piece \.piece-header h2 \{[\s\S]*font-weight:\s*600/);
    expect(css).toMatch(/\.take \{[\s\S]*font-style:\s*italic/);
    expect(css).toMatch(/\.take \{[\s\S]*border-top:\s*1px solid var\(--ink\)/);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);

    expect(read).not.toMatch(/Inside ·/);
    expect(read).not.toMatch(/Inside/);
    expect(read).not.toMatch(/>Take</);
    expect(read).not.toMatch(/takeLabel/);
    expect(read).toMatch(/page\.cover\.kicker \? <p className="kicker">\{page\.cover\.kicker\}<\/p> : null/);
    expect(page.cover.kicker).toBeUndefined();
    expect(page.contents.folio).toBe("02");
    expect(page.sequence[0]?.folio).toBe("03");

    expect(families).toEqual(["Source+Sans+3", "Source+Serif+4"]);
    expect(css).not.toMatch(/Playfair|Fraunces|Newsreader|Instrument|Cormorant|Libre Baskerville|IBM Plex|Inter["']/);
    expect(root).not.toMatch(/Playfair|Fraunces|Newsreader|family=Source\+Serif\+4.*family=/);

    expect(read).not.toMatch(/\bPress\b/);
    expect(read).not.toMatch(/\/clips\/\$/);
    expect(save).toMatch(/store\.insert\(/);
    expect(save).toMatch(/persistUnderstanding/);
    expect(save).toMatch(/persistRelated/);
    expect(save).toMatch(/persistSourceHeadline/);
  });

  it("lets TOC reach sheets and next advance the same object", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const page = composeIssue(issue);
    const sheets = readingSheets(page);

    expect(read.match(/<article/g)?.length).toBe(1);
    expect(read).toMatch(/goTo\(/);
    expect(read).toMatch(/pieceSheetIndex\(rowIndex\)/);
    expect(read).toMatch(/nextSheetIndex\(index, sheets\.length\)/);
    expect(read).toMatch(/previousSheetIndex\(index, sheets\.length\)/);
    expect(read).toMatch(/className="toc-row"/);
    expect(read).toMatch(/toc-row[\s\S]{0,80}onClick/);
    expect(read).toMatch(/is-turning/);
    expect(read).not.toMatch(/sheets\.map/);
    expect(read).not.toMatch(/className="spread"/);
    expect(read).not.toMatch(/isMobile|useMediaQuery|desktopSpread|mobileSheet/);
    expect(read).not.toMatch(/page-flip|stpageflip|turn\.js|react-pageflip|pageflip/i);

    expect(pieceSheetIndex(0)).toBe(2);
    expect(sheets[pieceSheetIndex(0)]?.kind).toBe("piece");
    expect(nextSheetIndex(0, sheets.length)).toBe(1);
    expect(nextSheetIndex(1, sheets.length)).toBe(2);
    expect(nextSheetIndex(2, sheets.length)).toBe(2);

    expect(css).toMatch(/\.sheet\.is-turning/);
    expect(css).toMatch(/translateX\(-5%\) rotate\(-0\.8deg\)/);
    expect(css).not.toMatch(/page-curl|curl-corner|flip-book|page-flip|stpageflip/i);
    expect(css).not.toMatch(/perspective|rotateY/i);
    expect(css).not.toMatch(/two-page|page-spread|verso|recto/i);
  });

  it("keeps mobile as a single-column same object, not a pinch-PDF", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    const pkg = readFileSync("package.json", "utf8");
    const lock = readFileSync("package-lock.json", "utf8");

    expect(css).toMatch(/@media \(max-width: 48rem\) \{[\s\S]*flex-direction:\s*column/);
    expect(css).toMatch(/@media \(max-width: 48rem\) \{[\s\S]*column-count:\s*1/);
    expect(css).toMatch(/@media \(max-width: 48rem\) \{[\s\S]*\.toc-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
    expect(read).not.toMatch(/matchMedia\(["']\(max-width/);
    expect(read).not.toMatch(/isMobile|useMediaQuery/);
    expect(read.match(/<article/g)?.length).toBe(1);

    expect(read).not.toMatch(/pdfjs|pdf\.js|react-pdf|application\/pdf|embed.*pdf|iframe.*pdf/i);
    expect(css).not.toMatch(/pinch-zoom|touch-action:\s*pinch-zoom/i);
    expect(pkg).not.toMatch(/pdfjs|react-pdf|page-flip|stpageflip|react-pageflip|turn\.js/i);
    expect(lock).not.toMatch(/page-flip|stpageflip|react-pageflip|turn\.js/i);
    expect(read).not.toMatch(/\bPress\b/);
    expect(read).not.toMatch(/\/clips\/\$/);
    expect(read).toMatch(/printThisIssue/);
    expect(read).not.toMatch(/window\.print|printIssue/);
  });
});
