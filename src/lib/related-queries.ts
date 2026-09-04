/**
 * Grok structures two short search strings from the Keep understanding.
 * Not search. Not URL picks. Brave still finds pages. PROTOCOL §3 / §4 / §11.
 */

import { grokModel, xaiChatUrl } from "./model";
import { serverEnv } from "./server-env";
import type { Understanding } from "./understanding";

export type RelatedSearchStrings = {
  comparable: string;
  contrarian: string;
};

export type RelatedSearchStringsFn = (topic: Understanding) => Promise<RelatedSearchStrings>;

export const relatedQueryMax = 120;

export const relatedQueryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["comparable", "contrarian"],
  properties: {
    comparable: { type: "string" },
    contrarian: { type: "string" },
  },
};

export const relatedQuerySystemPrompt = [
  "Structure two short search strings from this topic.",
  "Return only comparable and contrarian.",
  "Comparable is other reporting on the same topic.",
  "Contrarian is a contrasting or opposing angle on the same topic.",
  "Each string is a short web search query, not a URL.",
  "You only structure two short search strings.",
  "You must not search the web.",
  "You must not pick URLs.",
  "You must not invent related pages.",
  "You must not call web_search.",
  "You must not use tools.",
].join(" ");

function compactString(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function looksLikeUrlPick(value: string) {
  return /https?:\/\//i.test(value) || /^\s*www\./i.test(value);
}

export function parseRelatedSearchStrings(value: unknown): RelatedSearchStrings {
  if (!value || typeof value !== "object") {
    throw new Error("Related search strings are not an object.");
  }
  const rec = value as Record<string, unknown>;
  const comparable = compactString(rec.comparable, relatedQueryMax);
  const contrarian = compactString(rec.contrarian, relatedQueryMax);
  if (!comparable || !contrarian) {
    throw new Error("Related search strings require comparable and contrarian.");
  }
  if (looksLikeUrlPick(comparable) || looksLikeUrlPick(contrarian)) {
    throw new Error("Related search strings must not be URLs.");
  }
  return { comparable, contrarian };
}

export function relatedQueryUserContent(topic: Understanding) {
  return [
    `contentType: ${topic.contentType}`,
    `topic: ${topic.topic}`,
    `entities: ${topic.entities.length ? topic.entities.join(", ") : "(none)"}`,
    topic.date ? `date: ${topic.date}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRelatedQueryRequest(topic: Understanding) {
  return {
    model: grokModel,
    messages: [
      { role: "system", content: relatedQuerySystemPrompt },
      { role: "user", content: relatedQueryUserContent(topic) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "related_search_strings",
        strict: true,
        schema: relatedQueryJsonSchema,
      },
    },
  };
}

export type GrokPost = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export async function runGrokRelatedQueries(
  topic: Understanding,
  deps?: { apiKey?: string; post?: GrokPost },
): Promise<RelatedSearchStrings> {
  const apiKey = deps?.apiKey ?? serverEnv("XAI_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }

  const request = buildRelatedQueryRequest(topic);
  const post = deps?.post ?? fetch;
  const response = await post(xaiChatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Grok related search strings failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  const content = grokMessageContent(payload);
  return parseRelatedSearchStrings(JSON.parse(content) as unknown);
}

function grokMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Grok returned no related search strings.");
  }
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Grok returned no related search string text.");
  }
  return content;
}
