import { describe, expect, it } from "vitest";
import { extractArticleWords, fetchArticleWords, isPublicHttpUrl } from "../src/lib/article";

describe("original words stay the author's", () => {
  it("extracts headline and paragraphs from the article, not a fragment paste-up", () => {
    const words = extractArticleWords(
      `<html><head><title>Ignore</title></head><body>
        <article>
          <h1>The harbour vote</h1>
          <p>The assembly met at dusk in Praia.</p>
          <p>The motion carried after a quiet count.</p>
        </article>
      </body></html>`,
      "https://example.com/kept",
    );
    expect(words.headline).toBe("The harbour vote");
    expect(words.paragraphs).toEqual([
      "The assembly met at dusk in Praia.",
      "The motion carried after a quiet count.",
    ]);
    expect(words.figure).toBeUndefined();
  });

  it("locks a source-owned figure from og:image and never invents one", () => {
    const words = extractArticleWords(
      `<html><head>
        <meta property="og:image" content="https://images.example/harbour.jpg" />
        <title>Ignore</title>
      </head><body>
        <article>
          <h1>The harbour vote</h1>
          <p>The assembly met at dusk in Praia.</p>
        </article>
      </body></html>`,
      "https://example.com/kept",
    );
    expect(words.figure).toBe("https://images.example/harbour.jpg");

    const local = extractArticleWords(
      `<html><head><meta property="og:image" content="http://127.0.0.1/x.jpg" /></head>
       <body><article><h1>Kept</h1><p>Author sentence one.</p></article></body></html>`,
      "https://example.com/kept",
    );
    expect(local.figure).toBeUndefined();
  });

  it("refuses private hosts and returns fetched words from public HTML", async () => {
    expect(isPublicHttpUrl("http://127.0.0.1/x")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.9/x")).toBe(false);
    expect(isPublicHttpUrl("https://example.com/kept")).toBe(true);

    const words = await fetchArticleWords("https://example.com/kept", {
      get: async () =>
        new Response(
          `<article><h1>Kept</h1><p>Author sentence one.</p><p>Author sentence two.</p></article>`,
          { status: 200 },
        ),
    });
    expect(words.paragraphs).toEqual(["Author sentence one.", "Author sentence two."]);
  });
});
