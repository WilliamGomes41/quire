import { describe, expect, it } from "vitest";
import { grokModel } from "../src/lib/model";
import {
  buildRelatedQueryRequest,
  parseRelatedSearchStrings,
  relatedQueryJsonSchema,
  relatedQuerySystemPrompt,
  relatedQueryUserContent,
  runGrokRelatedQueries,
} from "../src/lib/related-queries";
import { contentTypes } from "../src/lib/understanding";

const topic = {
  contentType: "News" as const,
  topic: "A harbour vote",
  entities: ["Praia"],
  date: "2026-09-01",
};

describe("Grok related search strings are not search", () => {
  it("asks only for comparable and contrarian, with no web_search or URL pick tools", () => {
    const request = buildRelatedQueryRequest(topic);
    const body = JSON.stringify(request);

    expect(request.model).toBe(grokModel);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("search_parameters");
    expect(request).not.toHaveProperty("web_search");
    expect(Object.keys(request)).toEqual(["model", "messages", "response_format"]);
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema).toEqual(relatedQueryJsonSchema);
    expect(relatedQueryJsonSchema.required).toEqual(["comparable", "contrarian"]);
    expect(Object.keys(relatedQueryJsonSchema.properties)).toEqual(["comparable", "contrarian"]);
    expect(body).toMatch(/must not call web_search/);
    expect(relatedQuerySystemPrompt).toMatch(/two short search strings/i);
    expect(relatedQuerySystemPrompt).toMatch(/must not search/i);
    expect(relatedQuerySystemPrompt).toMatch(/must not pick URLs/i);
    expect(relatedQuerySystemPrompt).toMatch(/must not invent related pages/i);
    expect(relatedQuerySystemPrompt).toMatch(/must not call web_search/i);
    expect(relatedQuerySystemPrompt).toMatch(/must not use tools/i);
    expect(request.messages[1]).toEqual({
      role: "user",
      content: relatedQueryUserContent(topic),
    });
    expect(request.messages[1]?.content).toMatch(/A harbour vote/);
    expect(request.messages[1]?.content).toMatch(/Praia/);
    expect(request.messages[1]?.content).not.toMatch(/https?:\/\//);
  });

  it("posts that same no-search body to xAI", async () => {
    let posted: unknown;
    const strings = await runGrokRelatedQueries(topic, {
      apiKey: "test-key",
      post: async (_url, init) => {
        posted = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    comparable: "harbour vote Praia reporting",
                    contrarian: "harbour vote opposition Praia",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    expect(strings).toEqual({
      comparable: "harbour vote Praia reporting",
      contrarian: "harbour vote opposition Praia",
    });
    expect(posted).toEqual(buildRelatedQueryRequest(topic));
    expect(posted).not.toHaveProperty("tools");
    expect(posted).not.toHaveProperty("search_parameters");
    expect(posted).not.toHaveProperty("web_search");
  });

  it("rejects missing strings and URL picks fail-closed", () => {
    expect(() => parseRelatedSearchStrings({ comparable: "harbour vote", contrarian: "" })).toThrow(
      /comparable and contrarian/,
    );
    expect(() =>
      parseRelatedSearchStrings({
        comparable: "https://news.example/harbour",
        contrarian: "harbour vote opposition",
      }),
    ).toThrow(/must not be URLs/);
    expect(() =>
      parseRelatedSearchStrings({
        comparable: "harbour vote https://news.example/harbour",
        contrarian: "harbour vote opposition",
      }),
    ).toThrow(/must not be URLs/);
  });

  it("does not rewrite the Keep understanding contentTypes enum", () => {
    expect(contentTypes).toEqual(["News", "Comment", "Study", "Notice"]);
    expect(relatedQueryJsonSchema.properties).not.toHaveProperty("contentType");
    expect(relatedQueryJsonSchema.properties).not.toHaveProperty("urls");
    expect(relatedQueryJsonSchema.properties).not.toHaveProperty("pages");
  });
});
