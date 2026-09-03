import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractSourceHeadline, runSourceHeadline, sourceHeadlineRecord } from "../src/lib/source-headline";
import { couldNotReadHeadline, noHeadlineOnSource, sourceHeadlineCopy } from "../src/copy";

describe("source headline is extracted, not invented", () => {
  it("prefers og:title, then document title, then h1, and never the URL", () => {
    expect(
      extractSourceHeadline(
        `<html><head>
          <meta property="og:title" content="The harbour vote" />
          <title>Site chrome</title>
        </head><body><h1>Ignore</h1><p>The assembly met at dusk in Praia.</p></body></html>`,
      ),
    ).toEqual({
      text: "The harbour vote",
      snippet: "The assembly met at dusk in Praia.",
    });

    expect(
      extractSourceHeadline(
        `<html><head><title>A column on reading</title></head><body><p>Words.</p></body></html>`,
      ).text,
    ).toBe("A column on reading");

    expect(
      extractSourceHeadline(`<html><body><h1>A notice</h1></body></html>`).text,
    ).toBe("A notice");

    const none = extractSourceHeadline(`<html><body><div>No title here</div></body></html>`);
    expect(none.text).toBe("");
    expect(none.text).not.toMatch(/^https?:/i);
    expect(sourceHeadlineRecord(none)).toEqual({ status: "empty" });
    expect(sourceHeadlineRecord({ text: "The harbour vote" })).toEqual({
      status: "ok",
      text: "The harbour vote",
    });
  });

  it("keeps a source-owned snippet and stored figure without inventing either", () => {
    expect(
      extractSourceHeadline(
        `<html><head>
          <meta property="og:title" content="The harbour vote" />
          <meta property="og:image" content="/harbour.jpg" />
          <meta property="og:description" content="A harbour note." />
        </head><body></body></html>`,
        "https://news.example/harbour",
      ),
    ).toEqual({
      text: "The harbour vote",
      snippet: "A harbour note.",
      figure: "https://news.example/harbour.jpg",
    });

    expect(
      extractSourceHeadline(
        `<html><head><meta property="og:image" content="javascript:alert(1)" /></head><body></body></html>`,
        "https://news.example/harbour",
      ).figure,
    ).toBeUndefined();

    expect(
      sourceHeadlineRecord({
        text: "The harbour vote",
        snippet: "The assembly met at dusk.",
        figure: "https://news.example/harbour.jpg",
      }),
    ).toEqual({
      status: "ok",
      text: "The harbour vote",
      snippet: "The assembly met at dusk.",
      figure: "https://news.example/harbour.jpg",
    });
  });

  it("speaks empty vs fail as distinct copy", () => {
    expect(noHeadlineOnSource).not.toBe(couldNotReadHeadline);
    expect(sourceHeadlineCopy({ status: "empty" }).text).toBe(noHeadlineOnSource);
    expect(sourceHeadlineCopy({ status: "failed" }).text).toBe(couldNotReadHeadline);
    expect(sourceHeadlineCopy({ status: "ok" }).text).toBe("");
    expect(sourceHeadlineCopy({ status: "failed" }).text).not.toMatch(/nothing more on this topic/i);
  });

  it("speaks a stored fail that already names the sentence once, including 403", async () => {
    await expect(
      runSourceHeadline({
        url: "https://news.example/harbour",
        get: async () => new Response("", { status: 403 }),
      }),
    ).rejects.toThrow(`${couldNotReadHeadline} (403)`);

    const stored = `${couldNotReadHeadline} (403)`;
    const spoken = sourceHeadlineCopy({ status: "failed", message: stored });
    expect(spoken.kind).toBe("fail");
    expect(spoken.text).toBe(stored);
    expect(spoken.text).toContain("403");
    expect(spoken.text.match(/Could not read a headline from the source\./g)).toHaveLength(1);
    expect(spoken.text).not.toBe(`${couldNotReadHeadline} ${stored}`);
    expect(sourceHeadlineCopy({ status: "empty" }).text).toBe(noHeadlineOnSource);
    expect(sourceHeadlineCopy({ status: "empty" }).kind).toBe("empty");
    expect(spoken.text).not.toBe(noHeadlineOnSource);
  });

  it("does not invent a headline from a 403, and BindCard does not print the sentence twice", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const headline = readFileSync("src/lib/source-headline.ts", "utf8");
    const bindCard = keep.slice(keep.indexOf("function BindCard"), keep.indexOf("function UnderstandingFail"));
    expect(bindCard).toMatch(/sourceHeadlineCopy\(clip\.sourceHeadline\)/);
    expect(bindCard).toMatch(/\{headlineSpoken\.text\}/);
    expect(bindCard).not.toMatch(/headlineSpoken\.text[\s\S]*clip\.sourceHeadline\.message/);
    expect(bindCard).not.toMatch(/` \$\{clip\.sourceHeadline\.message\}`/);
    expect(headline).toMatch(/throw new Error\(`\$\{couldNotReadHeadline\} \(\$\{response\.status\}\)`\)/);
    expect(headline).toMatch(/if \(!response\.ok\) \{\s*throw new Error/);
    expect(headline).not.toMatch(/if \(response\.status === 403\)/);
    expect(keep).toMatch(/<h2>\{pressLabel\}<\/h2>/);
    expect(keep).not.toMatch(/to=["']\/press["']/);
  });
});
