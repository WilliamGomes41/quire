import { describe, expect, it } from "vitest";
import { extractClaimSource, claimSourceReady } from "../src/lib/article";
import { grokModel } from "../src/lib/model";
import {
  buildUnderstandingRequest,
  characterizationJsonSchema,
  contentTypes,
  parseUnderstanding,
  readUnderstanding,
  runGrokUnderstanding,
  understandingJsonSchema,
  understandingSystemPrompt,
  understandingUserContent,
} from "../src/lib/understanding";

const harbourSource = {
  headline: "The harbour vote",
  snippet: "The assembly met at dusk in Praia.",
  body: "The assembly met at dusk in Praia. The motion should carry after a quiet count along the quay. Councillors said the harbour vote binds the next season of work.".repeat(3),
};

describe("understanding schema", () => {
  it("accepts News, Comment, Study, or Notice with topic, entities, optional date, and claims", () => {
    expect(contentTypes).toEqual(["News", "Comment", "Study", "Notice"]);
    expect(contentTypes).not.toContain("Opinion");
    expect(understandingJsonSchema.properties.contentType.enum).toEqual([
      "News",
      "Comment",
      "Study",
      "Notice",
    ]);
    expect(understandingJsonSchema.properties.contentType.enum).not.toContain("Opinion");
    expect(understandingJsonSchema.required).toEqual([
      "contentType",
      "topic",
      "entities",
      "date",
      "centralClaim",
      "supportingClaims",
    ]);
    expect(characterizationJsonSchema.required).toEqual([
      "contentType",
      "topic",
      "entities",
      "date",
    ]);
    expect(characterizationJsonSchema.properties).not.toHaveProperty("centralClaim");
    expect(characterizationJsonSchema.properties).not.toHaveProperty("supportingClaims");
    expect(understandingJsonSchema.properties.topic).toEqual({ type: ["string", "null"] });
    expect(characterizationJsonSchema.properties.topic).toEqual({ type: ["string", "null"] });

    expect(
      parseUnderstanding({
        contentType: "News",
        topic: "A harbour vote",
        entities: ["Praia"],
        date: "2026-09-01",
        centralClaim: "The harbour vote should carry in Praia",
        supportingClaims: ["The quay needs a bound count"],
      }),
    ).toEqual({
      contentType: "News",
      topic: "A harbour vote",
      entities: ["Praia"],
      date: "2026-09-01",
      centralClaim: "The harbour vote should carry in Praia",
      supportingClaims: ["The quay needs a bound count"],
    });

    expect(
      parseUnderstanding({
        contentType: "Comment",
        topic: "A column on reading",
        entities: [],
        date: null,
        centralClaim: null,
        supportingClaims: [],
      }),
    ).toEqual({
      contentType: "Comment",
      topic: "A column on reading",
      entities: [],
    });

    expect(
      parseUnderstanding({
        contentType: "Comment",
        topic: "Intelligence",
        entities: ["Bubista", "William Gomes"],
        date: null,
        centralClaim: "",
        supportingClaims: [],
      }),
    ).toEqual({
      contentType: "Comment",
      topic: "Intelligence",
      entities: ["Bubista", "William Gomes"],
    });
  });

  it("caps supportingClaims at two and drops claims when source text is insufficient", () => {
    expect(
      parseUnderstanding({
        contentType: "News",
        topic: "A harbour vote",
        entities: [],
        date: null,
        centralClaim: "The harbour vote should carry",
        supportingClaims: ["One", "Two", "Three"],
      }).supportingClaims,
    ).toEqual(["One", "Two"]);

    expect(
      parseUnderstanding(
        {
          contentType: "News",
          topic: "A harbour vote",
          entities: ["Praia"],
          date: null,
          centralClaim: "Invented from the URL",
          supportingClaims: ["Also invented"],
        },
        { allowClaims: false },
      ),
    ).toEqual({
      contentType: "News",
      topic: "A harbour vote",
      entities: ["Praia"],
    });
  });

  it("keeps contentType when topic or claims are empty, limited, or missing", () => {
    expect(
      parseUnderstanding({
        contentType: "Comment",
        topic: null,
        entities: ["Bubista"],
        date: "2026-09-01",
        centralClaim: null,
        supportingClaims: [],
      }),
    ).toEqual({
      contentType: "Comment",
      topic: "",
      entities: ["Bubista"],
      date: "2026-09-01",
    });
    expect(
      parseUnderstanding({
        contentType: "Study",
        entities: ["A"],
      }),
    ).toEqual({
      contentType: "Study",
      topic: "",
      entities: ["A"],
    });
    expect(
      parseUnderstanding({
        contentType: "Notice",
        topic: "A harbour closure",
        entities: "no",
      }),
    ).toEqual({
      contentType: "Notice",
      topic: "A harbour closure",
      entities: [],
    });
  });

  it("rejects a shape that is not the Keep understanding record", () => {
    expect(() =>
      parseUnderstanding({ contentType: "Essay", topic: "x", entities: [] }),
    ).toThrow(/News, Comment, Study, or Notice/);
    expect(() => parseUnderstanding({ topic: "x", entities: [] })).toThrow(
      /News, Comment, Study, or Notice/,
    );
  });

  it("reads an ok characterization even when stored claims are missing", () => {
    expect(
      readUnderstanding({
        status: "ok",
        contentType: "Comment",
        topic: "Intelligence",
        entities: ["Bubista"],
      }),
    ).toEqual({
      status: "ok",
      contentType: "Comment",
      topic: "Intelligence",
      entities: ["Bubista"],
    });
    expect(
      readUnderstanding({
        status: "ok",
        contentType: "Essay",
        topic: "x",
        entities: [],
      }),
    ).toBeNull();
  });
});

describe("Grok does not search", () => {
  it("builds a request without web_search, tools, or search_parameters", () => {
    const request = buildUnderstandingRequest({
      url: "https://example.com/kept",
      source: harbourSource,
    });
    const body = JSON.stringify(request);

    expect(request.model).toBe(grokModel);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("search_parameters");
    expect(Object.keys(request)).toEqual(["model", "messages", "response_format"]);
    expect(body).toMatch(/must not call web_search/);
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema).toEqual(understandingJsonSchema);
    expect(understandingSystemPrompt).toMatch(/only structure the topic/i);
    expect(understandingSystemPrompt).toMatch(/must not search/i);
    expect(understandingSystemPrompt).toMatch(/must not pick URLs/i);
    expect(understandingSystemPrompt).toMatch(/must not call web_search/i);
    expect(understandingSystemPrompt).toMatch(/centralClaim/);
    expect(understandingSystemPrompt).toMatch(/Content type and topic remain/);
    expect(request.messages[1]).toEqual({
      role: "user",
      content: understandingUserContent({ url: "https://example.com/kept", source: harbourSource }),
    });
    expect(request.messages[1]?.content).toMatch(/The harbour vote/);
    expect(request.messages[1]?.content).toMatch(/assembly met at dusk/);
  });

  it("posts that same no-search body to xAI and keeps URL-only claims empty", async () => {
    let posted: unknown;
    const understood = await runGrokUnderstanding(
      { url: "https://example.com/study", source: harbourSource },
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
                      centralClaim: "The paper binds the count",
                      supportingClaims: [],
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
      centralClaim: "The paper binds the count",
    });
    expect(posted).toEqual(
      buildUnderstandingRequest({ url: "https://example.com/study", source: harbourSource }),
    );
    expect(posted).not.toHaveProperty("tools");
    expect(posted).not.toHaveProperty("search_parameters");

    const urlOnly = await runGrokUnderstanding(
      { url: "https://example.com/url-only" },
      {
        apiKey: "test-key",
        post: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      contentType: "News",
                      topic: "A harbour vote",
                      entities: ["Praia"],
                      date: null,
                      centralClaim: "Invented from the URL",
                      supportingClaims: ["Also invented"],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      },
    );
    expect(urlOnly).toEqual({
      contentType: "News",
      topic: "A harbour vote",
      entities: ["Praia"],
    });
    expect(understandingUserContent({ url: "https://example.com/url-only" })).toMatch(
      /insufficient for claim extraction/,
    );
  });

  it("asks only for characterization when claim source is insufficient", () => {
    const limited = buildUnderstandingRequest({ url: "https://williamgomes1.substack.com/p/note" });
    expect(limited.response_format.json_schema.schema).toEqual(characterizationJsonSchema);
    expect(limited.response_format.json_schema.schema).not.toEqual(understandingJsonSchema);
    expect(limited.response_format.json_schema.schema.required).not.toContain("centralClaim");

    const ready = buildUnderstandingRequest({
      url: "https://example.com/kept",
      source: harbourSource,
    });
    expect(ready.response_format.json_schema.schema).toEqual(understandingJsonSchema);
  });

  it("keeps Bubista-class contentType when Grok returns no claims", async () => {
    const understood = await runGrokUnderstanding(
      { url: "https://williamgomes1.substack.com/p/over-intelligentie" },
      {
        apiKey: "test-key",
        post: async (_url, init) => {
          const body = JSON.parse(init.body) as {
            response_format: { json_schema: { schema: unknown } };
          };
          expect(body.response_format.json_schema.schema).toEqual(characterizationJsonSchema);
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      contentType: "Comment",
                      topic: "Intelligence",
                      entities: ["Bubista", "William Gomes"],
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
      contentType: "Comment",
      topic: "Intelligence",
      entities: ["Bubista", "William Gomes"],
    });

    const objectContent = await runGrokUnderstanding(
      { url: "https://williamgomes1.substack.com/p/note" },
      {
        apiKey: "test-key",
        post: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: {
                      contentType: "Comment",
                      topic: null,
                      entities: ["Bubista"],
                      date: null,
                    },
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      },
    );
    expect(objectContent).toEqual({
      contentType: "Comment",
      topic: "",
      entities: ["Bubista"],
    });
  });
});

describe("Grok request still has no search after the rail", () => {
  it("does not add tools, web_search, or search_parameters to the Keep understanding request", () => {
    const request = buildUnderstandingRequest({ url: "https://example.com/kept" });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("search_parameters");
    expect(request).not.toHaveProperty("web_search");
    expect(Object.keys(request)).toEqual(["model", "messages", "response_format"]);
    expect(request.response_format.json_schema.schema).toEqual(characterizationJsonSchema);
  });
});

describe("claim source grounding", () => {
  it("needs headline or snippet plus a cleaned body, not a URL alone", () => {
    expect(claimSourceReady(undefined)).toBe(false);
    expect(claimSourceReady({ headline: "The harbour vote" })).toBe(false);
    expect(claimSourceReady(harbourSource)).toBe(true);

    const html = `
      <html><head><title>The harbour vote</title>
      <meta property="og:description" content="The assembly met at dusk in Praia."></head>
      <body><article><h1>The harbour vote</h1>
      <p>${"The assembly met at dusk in Praia. ".repeat(8)}</p>
      </article></body></html>
    `;
    const source = extractClaimSource(html, "https://example.com/kept");
    expect(source.headline).toMatch(/harbour vote/i);
    expect(source.body?.length).toBeGreaterThan(80);
    expect(claimSourceReady(source)).toBe(true);
  });
});
