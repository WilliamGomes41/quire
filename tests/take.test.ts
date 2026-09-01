import { describe, expect, it } from "vitest";
import { grokModel } from "../src/lib/model";
import {
  buildTakeRequest,
  parseTake,
  runGrokTake,
  takeJsonSchema,
  takeSystemPrompt,
} from "../src/lib/take";

const words = {
  url: "https://example.com/kept",
  headline: "The harbour vote",
  paragraphs: ["The assembly met at dusk in Praia."],
};

describe("optional take is not search and not a TL;DR kicker", () => {
  it("builds a take request without tools, web_search, or search_parameters", () => {
    const request = buildTakeRequest(words);
    const body = JSON.stringify(request);
    expect(request.model).toBe(grokModel);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("search_parameters");
    expect(request).not.toHaveProperty("web_search");
    expect(Object.keys(request)).toEqual(["model", "messages", "response_format"]);
    expect(body).toMatch(/must not call web_search/);
    expect(takeSystemPrompt).toMatch(/not a TL;DR kicker/);
    expect(takeSystemPrompt).toMatch(/must not search/i);
    expect(request.response_format.json_schema.schema).toEqual(takeJsonSchema);
    expect(request.messages[1]?.content).toMatch(/assembly met at dusk/);
  });

  it("posts that same no-search body to xAI", async () => {
    let posted: unknown;
    const text = await runGrokTake(words, {
      apiKey: "test-key",
      post: async (_url, init) => {
        posted = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ text: "A quiet count." }) } }],
          }),
          { status: 200 },
        );
      },
    });
    expect(text).toBe("A quiet count.");
    expect(posted).toEqual(buildTakeRequest(words));
    expect(posted).not.toHaveProperty("tools");
    expect(parseTake({ text: "  A take.  " })).toBe("A take.");
  });
});
