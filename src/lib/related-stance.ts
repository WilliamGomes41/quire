/**
 * One fail-closed Grok call labels already-retrieved related pages.
 * Query origin is not stance. Grok does not search, pick URLs, or name a page absent.
 */

import { canonicalizeUrl } from "./article";
import { grokModel, xaiChatUrl } from "./model";
import {
  isRelatedStance,
  type RelatedPage,
  type RelatedStance,
} from "./related";
import { serverEnv } from "./server-env";
import type { Understanding } from "./understanding";

export type SlotKind = "comparable" | "contrarian";
export type SlotState = "present" | "absent" | "unjudged";

export type RelatedStanceLabel = {
  url: string;
  stance: RelatedStance;
};

export type RelatedStanceLabels = {
  pages: RelatedStanceLabel[];
};

export type RelatedStanceContext = {
  topic?: Understanding | null;
  headline?: string;
};

export type RelatedStanceFn = (
  pages: RelatedPage[],
  context: RelatedStanceContext,
) => Promise<RelatedPage[]>;

export const relatedStanceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "stance"],
        properties: {
          url: { type: "string" },
          stance: { type: "string", enum: ["comparable", "contrarian", "inconclusive"] },
        },
      },
    },
  },
};

export const relatedStanceSystemPrompt = [
  "Label each already-retrieved page. Return only pages with url and stance.",
  "Stance is comparable, contrarian, or inconclusive.",
  "Comparable is other reporting on the same topic, nearby framing.",
  "Contrarian is relevant intellectual resistance to a carrying assumption, interpretation, causality, implication, or bound of the keep.",
  "Contrarian is not tone.",
  "Contrarian is not an opposite conclusion alone.",
  "Contrarian is not the query that retrieved the page.",
  "Query origin is not stance.",
  "Inconclusive means you looked and cannot place the angle.",
  "Insufficient material to place the angle is inconclusive.",
  "Tone or aspect alone is not contrarian.",
  "An opposite conclusion alone is inconclusive.",
  "Material resistance to a carrying bound of the keep is contrarian.",
  "You only label pages already supplied.",
  "You must not invent URLs.",
  "You must not invent related pages.",
  "You must not search the web.",
  "You must not pick URLs.",
  "You must not call web_search.",
  "You must not use tools.",
  "You must not label a page absent.",
  "Absent is not a stance.",
].join(" ");

export function relatedStanceUserContent(
  pages: RelatedPage[],
  context: RelatedStanceContext = {},
) {
  const topic = context.topic;
  const headline = (context.headline ?? "").trim();
  const lines = [
    topic
      ? [
          `contentType: ${topic.contentType}`,
          `topic: ${topic.topic}`,
          `entities: ${topic.entities.length ? topic.entities.join(", ") : "(none)"}`,
          topic.date ? `date: ${topic.date}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "understanding: (none)",
    headline ? `source headline: ${headline}` : "source headline: (none)",
    "pages:",
    ...pages.map((page) =>
      [
        `- url: ${page.url}`,
        page.title ? `  title: ${page.title}` : "",
        page.snippet ? `  snippet: ${page.snippet}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];
  return lines.join("\n");
}

export function buildRelatedStanceRequest(pages: RelatedPage[], context: RelatedStanceContext = {}) {
  return {
    model: grokModel,
    messages: [
      { role: "system", content: relatedStanceSystemPrompt },
      { role: "user", content: relatedStanceUserContent(pages, context) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "related_page_stances",
        strict: true,
        schema: relatedStanceJsonSchema,
      },
    },
  };
}

export function parseRelatedStances(value: unknown): RelatedStanceLabels {
  if (!value || typeof value !== "object") {
    throw new Error("Related stances are not an object.");
  }
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.pages)) {
    throw new Error("Related stances require pages.");
  }
  const pages: RelatedStanceLabel[] = [];
  for (const item of rec.pages) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string" || !row.url.trim()) continue;
    if (!isRelatedStance(row.stance)) continue;
    pages.push({ url: row.url.trim(), stance: row.stance });
  }
  return { pages };
}

/** Drop invented URLs. A skipped URL stays unlabeled — not silent inconclusive. */
export function applyRelatedStances(pages: RelatedPage[], labeled: RelatedStanceLabel[]): RelatedPage[] {
  const allowed = new Set(pages.map((page) => canonicalizeUrl(page.url)).filter(Boolean));
  const labels = new Map<string, RelatedStance>();
  for (const item of labeled) {
    const key = canonicalizeUrl(item.url);
    if (!key || !allowed.has(key)) continue;
    if (!isRelatedStance(item.stance)) continue;
    labels.set(key, item.stance);
  }
  return pages.map((page) => {
    const stance = labels.get(canonicalizeUrl(page.url));
    const next = {
      url: page.url,
      ...(page.title ? { title: page.title } : {}),
      ...(page.snippet ? { snippet: page.snippet } : {}),
      ...(page.date ? { date: page.date } : {}),
      ...(stance ? { stance } : {}),
    };
    return next;
  });
}

/**
 * present if any page has that stance.
 * unjudged if the set is empty or any page is unlabeled.
 * else absent. Inconclusives do not fill the gap.
 */
export function slotState(
  pages: { stance?: RelatedStance }[],
  slot: SlotKind,
): SlotState {
  if (pages.length === 0) return "unjudged";
  if (pages.some((page) => !page.stance)) return "unjudged";
  if (pages.some((page) => page.stance === slot)) return "present";
  return "absent";
}

export type GrokPost = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export async function runGrokRelatedStance(
  pages: RelatedPage[],
  context: RelatedStanceContext = {},
  deps?: { apiKey?: string; post?: GrokPost },
): Promise<RelatedPage[]> {
  if (pages.length === 0) return pages;

  const apiKey = deps?.apiKey ?? serverEnv("XAI_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }

  const request = buildRelatedStanceRequest(pages, context);
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
    throw new Error(`Grok related stance failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  const content = grokMessageContent(payload);
  const labeled = parseRelatedStances(JSON.parse(content) as unknown);
  return applyRelatedStances(pages, labeled.pages);
}

function grokMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Grok returned no related stances.");
  }
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Grok returned no related stance text.");
  }
  return content;
}
