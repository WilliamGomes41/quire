import { describe, expect, it } from "vitest";
import { grokModel } from "../src/lib/model";
import {
  buildUnderstandingRequest,
  contentTypes,
  parseUnderstanding,
  runGrokUnderstanding,
  understandingJsonSchema,
  understandingSystemPrompt,
} from "../src/lib/understanding";

describe("understanding schema", () => {
  it("accepts News, Comment, Study, or Notice with topic, entities, and optional date", () => {
    expect(contentTypes).toEqual(["News", "Comment", "Study", "Notice"]);
    expect(understandingJsonSchema.properties.contentType.enum).toEqual([
      "News",
      "Comment",
      "Study",
      "Notice",
    ]);
    expect(understandingJsonSchema.required).toEqual([
      "contentType",
      "topic",
      "entities",
      "date",
    ]);

    expect(
      parseUnderstanding({
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
        date: "2026-09-01",
      }),
    ).toEqual({
      contentType: "News",
      topic: "A harbour vote",
      entities: ["Praia"],
      date: "2026-09-01",
    });

    expect(
      parseUnderstanding({
        contentType: "Comment",
        topic: "A column on reading",
        entities: [],
        date: null,
      }),
    ).toEqual({
      contentType: "Comment",
      topic: "A column on reading",
      entities: [],
    });
  });

  it("rejects a shape that is not the Keep understanding record", () => {
    expect(() =>
      parseUnderstanding({ contentType: "Essay", topic: "x", entities: [] }),
    ).toThrow(/News, Comment, Study, or Notice/);
    expect(() =>
      parseUnderstanding({ contentType: "Study", entities: ["A"] }),
    ).toThrow(/topic/);
    expect(() =>
      parseUnderstanding({ contentType: "Notice", topic: "x", entities: "no" }),
    ).toThrow(/entities/);
  });
});

describe("Grok does not search", () => {
  it("builds a request without web_search, tools, or search_parameters", () => {
    const request = buildUnderstandingRequest({ url: "https://example.com/kept" });
    const body = JSON.stringify(request);

    expect(request.model).toBe(grokModel);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("search_parameters");
    expect(body).not.toMatch(/web_search/);
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema).toEqual(understandingJsonSchema);
    expect(understandingSystemPrompt).toMatch(/only structure the topic/i);
    expect(understandingSystemPrompt).toMatch(/must not search/i);
    expect(understandingSystemPrompt).toMatch(/must not pick URLs/i);
    expect(understandingSystemPrompt).toMatch(/must not call web_search/i);
    expect(request.messages[1]).toEqual({
      role: "user",
      content: "https://example.com/kept",
    });
  });

  it("posts that same no-search body to xAI", async () => {
    let posted: unknown;
    const understood = await runGrokUnderstanding(
      { url: "https://example.com/study" },
      {
        apiKey: "test-key",
        post: async (_url, init) => {
          posted = JSON.parse(init.body);
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      contentType: "Study",
                      topic: "A paper",
                      entities: ["WHO"],
                      date: null,
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        },
      },
    );

    expect(understood).toEqual({
      contentType: "Study",
      topic: "A paper",
      entities: ["WHO"],
    });
    expect(posted).toEqual(buildUnderstandingRequest({ url: "https://example.com/study" }));
    expect(JSON.stringify(posted)).not.toMatch(/web_search/);
  });
});
