import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractArticleWords } from "../src/lib/article";
import type { BoundIssue, BoundPiece } from "../src/lib/bind";
import { clusterPieces, composeIssue, pieceColophon, readingSheets } from "../src/lib/compose";
import { designIntent } from "../src/lib/design";
import { printPlan } from "../src/lib/print";

function piece(over: Partial<BoundPiece> & Pick<BoundPiece, "url" | "role" | "headline">): BoundPiece {
  return {
    paragraphs: ["The assembly met at dusk in Praia."],
    ...over,
  };
}

const multi: BoundIssue = {
  id: "issue-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  title: "The harbour vote",
  leadUrl: "https://example.com/kept",
  take: { status: "ok", text: "A quiet count in Praia." },
  pieces: [
    piece({
      url: "https://alpha.example/kept",
      role: "original",
      headline: "The harbour vote",
      paragraphs: ["The assembly met at dusk in Praia.", "The motion carried after a quiet count."],
      figure: "https://images.example/harbour.jpg",
      figureCaption: "The quay at dusk",
      figureCredit: "Praia desk",
      figureKind: "photo",
      publisher: "Praia Daily",
      published: "2026-09-01",
      topic: "A harbour vote",
    }),
    piece({
      url: "https://beta.example/chart",
      role: "related",
      headline: "Votes by ward",
      paragraphs: ["A chart of the count."],
      figure: "https://images.example/votes-chart.png",
      figureCaption: "Votes by ward chart",
      figureKind: "chart",
      topic: "A harbour vote",
    }),
    piece({
      url: "https://gamma.example/short",
      role: "related",
      headline: "A brief note",
      paragraphs: ["A short note on the quay."],
      topic: "A harbour vote",
    }),
    piece({
      url: "https://delta.example/watch",
      role: "related",
      headline: "Watch the count",
      paragraphs: ["A camera stood on the quay.", "Night fell after the vote.", "A third sentence stays off the briefing."],
      videoUrl: "https://youtube.com/watch?v=harbour",
      figure: "https://images.example/still.jpg",
      topic: "A harbour vote",
    }),
    piece({
      url: "https://zeta.example/other",
      role: "related",
      headline: "A distant storm",
      paragraphs: [
        "Rain reached the inland hills long before anyone in Praia looked up from the count.",
        "Farmers closed the shutters and waited out the weather that never made the harbour agenda.",
        "By morning the roads were rivers and the vote was already a story someone else would tell.",
        "A correspondent walked the ridge and wrote only of mud, lost hours, and a market that did not open.",
        "The storm had no harbour motion to carry, and no one in the chamber asked for a report from the hills.",
        "That silence is the piece: weather inland, written on its own terms, not as a footnote to the quay.",
      ],
      topic: "Weather inland",
      publisher: "Hill Gazette",
    }),
  ],
};

describe("multi-source Read magazine", () => {
  it("gives the lead highest budget: feature + visual-opener, else title-first", () => {
    const withFigure = composeIssue(multi);
    expect(withFigure.sequence[0]?.intent.treatment).toBe("feature");
    expect(withFigure.sequence[0]?.intent.composition).toBe("visual-opener");
    expect(withFigure.intent).toEqual(withFigure.sequence[0]?.intent);

    const titleFirst = designIntent({
      hasTake: false,
      hasSecondary: true,
      hasFigure: false,
      role: "original",
      chars: 800,
    });
    expect(titleFirst.treatment).toBe("feature");
    expect(titleFirst.composition).toBe("essay");
    expect(titleFirst.image_emphasis).toBe("none");
  });

  it("never packs another article onto the lead start sheet", () => {
    const page = composeIssue(multi);
    const lead = page.sequence[0];
    expect(lead?.headline).toBe("The harbour vote");
    expect(lead?.paragraphs.join(" ")).toMatch(/assembly met at dusk/);
    expect(lead?.paragraphs.join(" ")).not.toMatch(/Votes by ward|distant storm|Watch the count/);
    expect(page.sequence.map((sheet) => sheet.headline)).toHaveLength(5);
    expect(new Set(page.sequence.map((sheet) => sheet.headline)).size).toBe(5);
    expect(readingSheets(page).filter((sheet) => sheet.kind === "piece")).toHaveLength(5);
  });

  it("gives selected related real treatments, not same-weight dumps", () => {
    const page = composeIssue(multi);
    const byHead = Object.fromEntries(page.sequence.map((sheet) => [sheet.headline, sheet.intent]));
    expect(byHead["Votes by ward"]?.treatment).toBe("illustrated");
    expect(byHead["A brief note"]?.treatment).toBe("compact");
    expect(byHead["Watch the count"]?.treatment).toBe("screening");
    expect(byHead["A distant storm"]?.treatment).toBe("essay");
    expect(new Set(page.sequence.slice(1).map((sheet) => sheet.intent.treatment)).size).toBeGreaterThan(1);
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\[data-treatment="feature"\][\s\S]*font-size: clamp\(3\.5rem/);
    expect(css).toMatch(/\[data-treatment="compact"\][\s\S]*font-size: clamp\(2\.2rem/);
    expect(css).toMatch(/\[data-treatment="screening"\][\s\S]*font-size: clamp\(2\.2rem/);
  });

  it("clusters by topic, not hostname", () => {
    const order = clusterPieces(multi.pieces).map((item) => item.headline);
    expect(order[0]).toBe("The harbour vote");
    expect(order.slice(1, 4)).toEqual(["Votes by ward", "A brief note", "Watch the count"]);
    expect(order[4]).toBe("A distant storm");
    expect(order.join(" ")).not.toMatch(/alpha[\s\S]*beta[\s\S]*gamma[\s\S]*delta[\s\S]*zeta/);
    const compose = readFileSync("src/lib/compose.ts", "utf8");
    expect(compose).toMatch(/cluster by topic, never by hostname/);
    expect(compose).not.toMatch(/hostnameOf\(piece/);
  });

  it("contains figures unless Intent says cover; diagrams and charts contain only", () => {
    const page = composeIssue(multi);
    expect(page.sequence[0]?.figure?.fit).toBe("contain");
    expect(page.sequence.find((sheet) => sheet.headline === "Votes by ward")?.figure?.fit).toBe("contain");
    const covered = designIntent({
      hasTake: false,
      hasSecondary: false,
      hasFigure: true,
      role: "original",
      figureKind: "chart",
    });
    expect(covered.figure_fit).toBe("contain");
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.sheet-figure\.contain img \{[\s\S]*object-fit:\s*contain/);
  });

  it("prints captions and credits only when source-owned, and never invents Take", () => {
    const page = composeIssue(multi);
    expect(page.sequence[0]?.figure?.caption).toBe("The quay at dusk");
    expect(page.sequence[0]?.figure?.credit).toBe("Praia desk");
    expect(page.sequence[0]?.take).toEqual({ text: "A quiet count in Praia." });
    expect(page.sequence[1]?.take).toBeUndefined();
    const bare = composeIssue({
      ...multi,
      take: { status: "failed", message: "down", at: "2026-09-01T00:00:00.000Z" },
      pieces: [
        piece({
          url: "https://example.com/kept",
          role: "original",
          headline: "The harbour vote",
          paragraphs: ["The assembly met at dusk in Praia."],
          figure: "https://images.example/harbour.jpg",
        }),
      ],
    });
    expect(bare.take).toBeUndefined();
    expect(bare.sequence[0]?.take).toBeUndefined();
    expect(bare.sequence[0]?.figure?.caption).toBeUndefined();
    expect(bare.sequence[0]?.figure?.credit).toBeUndefined();
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/figure\.caption \? <span>\{figure\.caption\}<\/span> : null/);
    expect(read).toMatch(/sheet\.take \?/);
    expect(read).not.toMatch(/>Take</);
    expect(read).not.toMatch(/takeLabel/);
  });

  it("uses pull quotes and subheads only when the source already has them", () => {
    const html = extractArticleWords(
      `<article>
        <h1>The harbour vote</h1>
        <h2>On the quay</h2>
        <p>The assembly met at dusk in Praia.</p>
        <blockquote>The motion carried after a quiet count.</blockquote>
      </article>`,
      "https://example.com/kept",
    );
    expect(html.subheads).toEqual(["On the quay"]);
    expect(html.pullQuotes).toEqual(["The motion carried after a quiet count."]);
    expect(html.blocks?.map((block) => block.kind)).toEqual(["subhead", "paragraph", "pullQuote"]);

    const silent = extractArticleWords(
      `<article><h1>The harbour vote</h1><p>The assembly met at dusk in Praia.</p></article>`,
      "https://example.com/kept",
    );
    expect(silent.subheads).toBeUndefined();
    expect(silent.pullQuotes).toBeUndefined();
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/block\.kind === "subhead"/);
    expect(read).toMatch(/block\.kind === "pullQuote"/);
    expect(read).not.toMatch(/Invented quote|Lorem/);
  });

  it("sets a quiet publisher · date colophon only when source-owned", () => {
    const page = composeIssue(multi);
    expect(page.sequence[0]?.colophon).toBe("Praia Daily · 1 September 2026");
    expect(page.sequence.find((sheet) => sheet.headline === "A distant storm")?.colophon).toBe("Hill Gazette");
    expect(pieceColophon(piece({ url: "https://example.com/x", role: "related", headline: "X" }))).toBe("");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/sheet\.colophon \? <p className="colophon">\{sheet\.colophon\}<\/p> : null/);
    expect(read).not.toMatch(/hostnameOf\(sheet/);
  });

  it("keeps SI, related_reporting, and n of n off the sheet", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const article = read.slice(read.indexOf("<article"), read.lastIndexOf("</article>"));
    expect(article).not.toMatch(/related_reporting|More on this topic|getClipIntelligenceState|\/reliability/);
    expect(article).not.toMatch(/n of n| of n|\{index \+ 1\}/);
    expect(read).toMatch(/stage-turn/);
    expect(read.indexOf("stage-chrome")).toBeLessThan(read.indexOf("stage-well"));
  });

  it("keeps pass-2 tokens, cloth + one sheet, Print in chrome, and one Design Intent", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const compositor = readFileSync("src/lib/print-compose.ts", "utf8");
    const page = composeIssue(multi);
    const plan = printPlan(multi);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
    expect(css).not.toMatch(/#F3EEE4|#f3eee4|#3D4A3A|#3d4a3a/i);
    expect(compositor).not.toMatch(/243 \/ 255,\s*238 \/ 255,\s*228 \/ 255/);
    expect(compositor).not.toMatch(/61 \/ 255,\s*74 \/ 255,\s*58 \/ 255/);
    expect(css).toMatch(/\.sheet:hover \{[\s\S]*transform:\s*none/);
    expect(read).toMatch(/className="stage"/);
    expect(read).toMatch(/className="stage-print"/);
    expect(read.match(/<article/g)?.length).toBe(1);
    expect(plan.intent).toEqual(page.intent);
    expect(plan.sheets.filter((sheet) => sheet.kind === "piece").map((sheet) => sheet.kind)).toHaveLength(
      page.sequence.length,
    );
  });

  it("treats a video as a screening with a bounded briefing and a QR, not a watched dump", () => {
    const page = composeIssue(multi);
    const watch = page.sequence.find((sheet) => sheet.headline === "Watch the count");
    expect(watch?.intent.treatment).toBe("screening");
    expect(watch?.paragraphs).toEqual(["A camera stood on the quay.", "Night fell after the vote."]);
    expect(watch?.paragraphs.join(" ")).not.toMatch(/third sentence/);
    expect(watch?.videoUrl).toBe("https://youtube.com/watch?v=harbour");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/SheetQr/);
    expect(read).toMatch(/qrMatrix/);
    expect(read).not.toMatch(/we watched|transcript|listened/i);
  });
});

describe("source-owned magazine extras", () => {
  it("locks publisher, date, caption, and video from the page and never invents them", () => {
    const words = extractArticleWords(
      `<html><head>
        <meta property="og:image" content="https://images.example/harbour.jpg" />
        <meta property="og:image:alt" content="The quay at dusk" />
        <meta name="copyright" content="Praia desk" />
        <meta property="og:site_name" content="Praia Daily" />
        <meta property="article:published_time" content="2026-09-01" />
        <meta property="og:type" content="video.other" />
      </head>
      <body><article><h1>Watch the count</h1><p>A camera stood on the quay.</p></article></body></html>`,
      "https://youtube.com/watch?v=harbour",
    );
    expect(words.figureCaption).toBe("The quay at dusk");
    expect(words.figureCredit).toBe("Praia desk");
    expect(words.publisher).toBe("Praia Daily");
    expect(words.published).toBe("2026-09-01");
    expect(words.videoUrl).toBe("https://youtube.com/watch?v=harbour");

    const plain = extractArticleWords(
      `<article><h1>The harbour vote</h1><p>The assembly met at dusk in Praia.</p></article>`,
      "https://example.com/kept",
    );
    expect(plain.figureCaption).toBeUndefined();
    expect(plain.publisher).toBeUndefined();
    expect(plain.videoUrl).toBeUndefined();
  });
});
