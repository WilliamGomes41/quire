import { couldNotUnderstand } from "../copy";
import { grokModel, xaiChatUrl } from "./model";

export const contentTypes = ["News", "Comment", "Study", "Notice"] as const;
export type ContentType = (typeof contentTypes)[number];

export type Understanding = {
  contentType: ContentType;
  topic: string;
  entities: string[];
  date?: string;
};

export type UnderstandingFail = {
  status: "failed";
  message: string;
  at: string;
};

export type UnderstandingOk = Understanding & { status: "ok" };

export type UnderstandingRecord = UnderstandingOk | UnderstandingFail;

export const understandingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contentType", "topic", "entities", "date"],
  properties: {
    contentType: { type: "string", enum: [...contentTypes] },
    topic: { type: "string" },
    entities: { type: "array", items: { type: "string" } },
    date: { type: ["string", "null"] },
  },
};

export const understandingSystemPrompt = [
  "Structure the topic of this kept public URL.",
  "Return only content type (News, Comment, Study, or Notice), topic, entities, and optional date.",
  "You only structure the topic.",
  "You must not search the web.",
  "You must not pick URLs.",
  "You must not call web_search.",
  "You must not use tools.",
].join(" ");

export function parseUnderstanding(value: unknown): Understanding {
  if (!value || typeof value !== "object") {
    throw new Error("Understanding is not an object.");
  }
  const rec = value as Record<string, unknown>;
  const contentType = rec.contentType;
  if (!contentTypes.includes(contentType as ContentType)) {
    throw new Error("Understanding content type must be News, Comment, Study, or Notice.");
  }
  if (typeof rec.topic !== "string" || rec.topic.trim() === "") {
    throw new Error("Understanding topic is required.");
  }
  if (!Array.isArray(rec.entities) || rec.entities.some((item) => typeof item !== "string")) {
    throw new Error("Understanding entities must be an array of strings.");
  }
  const date =
    typeof rec.date === "string" && rec.date.trim() !== "" ? rec.date.trim() : undefined;

  return {
    contentType: contentType as ContentType,
    topic: rec.topic.trim(),
    entities: rec.entities.map((item) => item.trim()).filter(Boolean),
    ...(date ? { date } : {}),
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
    return { status: "ok", ...parseUnderstanding(rec) };
  }
  return null;
}

export function buildUnderstandingRequest(input: { url: string }) {
  return {
    model: grokModel,
    messages: [
      { role: "system", content: understandingSystemPrompt },
      { role: "user", content: input.url },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "keep_understanding",
        strict: true,
        schema: understandingJsonSchema,
      },
    },
  };
}

export type GrokPost = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export async function runGrokUnderstanding(
  input: { url: string },
  deps?: { apiKey?: string; post?: GrokPost },
): Promise<Understanding> {
  const apiKey = deps?.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }

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
  const content = grokMessageContent(payload);
  return parseUnderstanding(JSON.parse(content) as unknown);
}

function grokMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Grok returned no understanding.");
  }
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Grok returned no understanding text.");
  }
  return content;
}
