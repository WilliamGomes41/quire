/**
 * One fail-closed Grok judge on already-retrieved related pages.
 * Relevance first. Stance is optional. Query origin is not stance.
 * Grok does not search, pick URLs, reconstruct unseen body, or name a page absent.
 */

import { canonicalizeUrl } from "./article";
import { grokModel, xaiChatUrl } from "./model";
import {
  isRelatedStance,
  type RelatedJudgeFn,
  type RelatedPage,
  type RelatedStance,
} from "./related";
import { serverEnv } from "./server-env";
import { hasCentralClaim, type Understanding } from "./understanding";

export type SlotKind = "comparable" | "contrarian";
export type SlotState = "present" | "absent" | "unjudged";

export const relatedRelevances = ["direct", "contextual", "irrelevant", "uncertain"] as const;
export type RelatedRelevance = (typeof relatedRelevances)[number];

export function isRelatedRelevance(value: unknown): value is RelatedRelevance {
  return relatedRelevances.includes(value as RelatedRelevance);
}

export type RelatedStanceLabel = {
  url: string;
  stance: RelatedStance;
};

export type RelatedJudgment = {
  url: string;
  relevance: RelatedRelevance;
  stance?: RelatedStance;
};

export type RelatedStanceLabels = {
  pages: RelatedStanceLabel[];
};

export type RelatedStanceContext = {
  topic?: Understanding | null;
  headline?: string;
};

export type RelatedStanceFn = RelatedJudgeFn;

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
        required: ["url", "relevance", "stance"],
        properties: {
          url: { type: "string" },
          relevance: { type: "string", enum: [...relatedRelevances] },
          stance: { type: ["string", "null"], enum: ["comparable", "contrarian", "inconclusive", null] },
        },
      },
    },
  },
};

export const relatedStanceSystemPrompt = [
  "Judge each already-retrieved page against the given claims.",
  "Return only pages with url, relevance, and optional stance.",
  "Relevance is direct, contextual, irrelevant, or uncertain.",
  "Direct means the page addresses the central claim or a supporting claim.",
  "Contextual means the page is relevant background to those claims.",
  "Irrelevant means the page shares entities or topic words without the claims.",
  "Uncertain means the supplied title and snippet are not enough to place relevance.",
  "Stance is comparable, contrarian, or inconclusive. Stance is optional.",
  "Comparable is other reporting on the same claims, nearby framing.",
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
  "Do not reconstruct an unseen article body.",
  "You only judge pages already supplied.",
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
          `centralClaim: ${topic.centralClaim?.trim() || "(none)"}`,
          `supportingClaims: ${topic.supportingClaims?.length ? topic.supportingClaims.join(" | ") : "(none)"}`,
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
        name: "related_page_judge",
        strict: true,
        schema: relatedStanceJsonSchema,
      },
    },
  };
}

export function parseRelatedJudgments(value: unknown): RelatedJudgment[] {
  if (!value || typeof value !== "object") {
    throw new Error("Related judgments are not an object.");
  }
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.pages)) {
    throw new Error("Related judgments require pages.");
  }
  const pages: RelatedJudgment[] = [];
  for (const item of rec.pages) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string" || !row.url.trim()) continue;
    if (!isRelatedRelevance(row.relevance)) continue;
    const stance = isRelatedStance(row.stance) ? row.stance : undefined;
    pages.push({
      url: row.url.trim(),
      relevance: row.relevance,
      ...(stance ? { stance } : {}),
    });
  }
  return pages;
}

export function parseRelatedStances(value: unknown): RelatedStanceLabels {
  const pages = parseRelatedJudgments(value).flatMap((item) =>
    item.stance ? [{ url: item.url, stance: item.stance }] : [],
  );
  return { pages };
}

/** Drop invented URLs. A skipped URL stays unlabeled — not silent inconclusive. Drop irrelevant. */
export function applyRelatedJudgments(pages: RelatedPage[], labeled: RelatedJudgment[]): RelatedPage[] {
  const allowed = new Set(pages.map((page) => canonicalizeUrl(page.url)).filter(Boolean));
  const labels = new Map<string, RelatedJudgment>();
  for (const item of labeled) {
    const key = canonicalizeUrl(item.url);
    if (!key || !allowed.has(key)) continue;
    labels.set(key, item);
  }
  return pages.flatMap((page) => {
    const judged = labels.get(canonicalizeUrl(page.url));
    if (judged?.relevance === "irrelevant") return [];
    const stance = judged?.stance;
    return [
      {
        url: page.url,
        ...(page.title ? { title: page.title } : {}),
        ...(page.snippet ? { snippet: page.snippet } : {}),
        ...(page.date ? { date: page.date } : {}),
        ...(stance ? { stance } : {}),
      },
    ];
  });
}

/** Drop invented URLs. A skipped URL stays unlabeled — not silent inconclusive. */
export function applyRelatedStances(pages: RelatedPage[], labeled: RelatedStanceLabel[]): RelatedPage[] {
  return applyRelatedJudgments(
    pages,
    labeled.map((item) => ({ url: item.url, relevance: "direct" as const, stance: item.stance })),
  );
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
  if (!hasCentralClaim(context.topic)) return pages;

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
  const labeled = parseRelatedJudgments(JSON.parse(content) as unknown);
  return applyRelatedJudgments(pages, labeled);
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
