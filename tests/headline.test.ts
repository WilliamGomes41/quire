import { describe, expect, it } from "vitest";
import { extractSourceHeadline, sourceHeadlineRecord } from "../src/lib/source-headline";
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

  it("speaks empty vs fail as distinct copy", () => {
    expect(noHeadlineOnSource).not.toBe(couldNotReadHeadline);
    expect(sourceHeadlineCopy({ status: "empty" }).text).toBe(noHeadlineOnSource);
    expect(sourceHeadlineCopy({ status: "failed" }).text).toBe(couldNotReadHeadline);
    expect(sourceHeadlineCopy({ status: "ok" }).text).toBe("");
    expect(sourceHeadlineCopy({ status: "failed" }).text).not.toMatch(/nothing more on this topic/i);
  });
});
