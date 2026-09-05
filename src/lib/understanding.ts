import { couldNotUnderstand } from "../copy";
import {
  claimSourceReady,
  claimSourceText,
  type ClaimSource,
} from "./article";
import { grokModel, xaiChatUrl } from "./model";
import { serverEnv } from "./server-env";

export const contentTypes = ["News", "Comment", "Study", "Notice"] as const;
export type ContentType = (typeof contentTypes)[number];

export const SUPPORTING_CLAIMS_MAX = 2;

export type Understanding = {
  contentType: ContentType;
  topic: string;
  entities: string[];
  date?: string;
  centralClaim?: string;
  supportingClaims?: string[];
};

export type UnderstandingFail = {
  status: "failed";
  message: string;
  at: string;
};

export type UnderstandingOk = Understanding & { status: "ok" };

export type UnderstandingRecord = UnderstandingOk | UnderstandingFail;

const characterizationProperties = {
  contentType: { type: "string", enum: [...contentTypes] },
  topic: { type: ["string", "null"] },
  entities: { type: "array", items: { type: "string" } },
  date: { type: ["string", "null"] },
};

/** Characterization only. Used when claim source is insufficient so claims cannot wipe contentType. */
export const characterizationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contentType", "topic", "entities", "date"],
  properties: characterizationProperties,
};

export const understandingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contentType", "topic", "entities", "date", "centralClaim", "supportingClaims"],
  properties: {
    ...characterizationProperties,
    centralClaim: { type: ["string", "null"] },
    supportingClaims: { type: "array", items: { type: "string" } },
  },
};

export const understandingSystemPrompt = [
  "Structure the topic and claims of this kept public source.",
  "Return only content type (News, Comment, Study, or Notice), topic, entities, optional date, centralClaim, and up to two supportingClaims.",
  "Claims are the carrying thesis, explanation, or normative reasoning — not only factual claims.",
  "Ground claims in the supplied source text: headline, snippet or description, and cleaned body.",
  "URL-only text is insufficient for claim extraction.",
  "If the supplied text is not enough to extract a claim, leave centralClaim empty and supportingClaims empty.",
  "Content type and topic remain even when claims are empty or limited.",
  "You only structure the topic and claims.",
  "You must not search the web.",
  "You must not pick URLs.",
  "You must not call web_search.",
  "You must not use tools.",
].join(" ");

export function hasCentralClaim(topic?: Understanding | null) {
  return Boolean(topic?.centralClaim?.trim());
}

export function parseUnderstanding(
  value: unknown,
  opts?: { allowClaims?: boolean },
): Understanding {
  if (!value || typeof value !== "object") {
    throw new Error("Understanding is not an object.");
  }
  const rec = value as Record<string, unknown>;
  const contentType = rec.contentType;
  if (!contentTypes.includes(contentType as ContentType)) {
    throw new Error("Understanding content type must be News, Comment, Study, or Notice.");
  }
  const topic = typeof rec.topic === "string" ? rec.topic.trim() : "";
  const entities = Array.isArray(rec.entities)
    ? rec.entities
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const date =
    typeof rec.date === "string" && rec.date.trim() !== "" ? rec.date.trim() : undefined;
  const allowClaims = opts?.allowClaims !== false;
  const centralClaim =
    allowClaims && typeof rec.centralClaim === "string" && rec.centralClaim.trim() !== ""
      ? rec.centralClaim.trim()
      : undefined;
  const supportingClaims = allowClaims
    ? (Array.isArray(rec.supportingClaims) ? rec.supportingClaims : [])
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map((item) => item.trim())
        .slice(0, SUPPORTING_CLAIMS_MAX)
    : [];

  return {
    contentType: contentType as ContentType,
    topic,
    entities,
    ...(date ? { date } : {}),
    ...(centralClaim ? { centralClaim } : {}),
    ...(supportingClaims.length ? { supportingClaims } : {}),
  };
}

export function understandingFail(error: unknown, at = new Date().toISOString()): UnderstandingFail {
  const message =
    error instanceof Error && error.message.trim() !== ""
      ? error.message
      : couldNotUnderstand;
  return { status: "failed", message, at };
}

export function readUnderstanding(value: unknown): UnderstandingRecord | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.status === "failed") {
    return {
      status: "failed",
      message: typeof rec.message === "string" && rec.message ? rec.message : couldNotUnderstand,
      at: typeof rec.at === "string" ? rec.at : "",
    };
  }
  if (rec.status === "ok") {
    try {
      return { status: "ok", ...parseUnderstanding(rec) };
    } catch {
      return null;
    }
  }
  return null;
}

export function understandingUserContent(input: { url: string; source?: ClaimSource }) {
  if (claimSourceReady(input.source) && input.source) {
    return [`url: ${input.url}`, claimSourceText(input.source)].join("\n");
  }
  return [
    `url: ${input.url}`,
    "Source text is insufficient for claim extraction. Leave centralClaim and supportingClaims empty.",
  ].join("\n");
}

export function buildUnderstandingRequest(input: { url: string; source?: ClaimSource }) {
  const allowClaims = claimSourceReady(input.source);
  return {
    model: grokModel,
    messages: [
      { role: "system", content: understandingSystemPrompt },
      { role: "user", content: understandingUserContent(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "keep_understanding",
        strict: true,
        schema: allowClaims ? understandingJsonSchema : characterizationJsonSchema,
      },
    },
  };
}

export type GrokPost = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export type UnderstandInput = { url: string; source?: ClaimSource };

export async function runGrokUnderstanding(
  input: UnderstandInput,
  deps?: { apiKey?: string; post?: GrokPost },
): Promise<Understanding> {
  const apiKey = deps?.apiKey ?? serverEnv("XAI_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }

  const allowClaims = claimSourceReady(input.source);
  const request = buildUnderstandingRequest(input);
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
    throw new Error(`Grok understanding failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  return parseUnderstanding(grokUnderstandingValue(payload), { allowClaims });
}

function grokUnderstandingValue(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    throw new Error("Grok returned no understanding.");
  }
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (content && typeof content === "object") return content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Grok returned no understanding text.");
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Grok returned no understanding.");
  }
}
