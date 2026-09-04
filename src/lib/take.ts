/**
 * Optional editorial take beside the complete original.
 * Separate Grok call after Select. Not search. Not a TL;DR kicker. PROTOCOL §5 / §6.
 */

import { jsonText } from "./article";
import { grokModel, xaiChatUrl } from "./model";
import type { ArticleWords } from "./article";
import { serverEnv } from "./server-env";

export type TakeOk = { status: "ok"; text: string };
export type TakeFail = { status: "failed"; message: string; at: string };
export type TakeRecord = TakeOk | TakeFail;

export const takeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: { type: "string" },
  },
};

export const takeSystemPrompt = [
  "Write an optional editorial take beside this complete original article.",
  "The take sits beside the author's words. It must not replace them.",
  "Do not rewrite the article.",
  "Do not invent facts.",
  "This is a take, not a TL;DR kicker.",
  "You only write the take from the supplied original words.",
  "You must not search the web.",
  "You must not pick URLs.",
  "You must not call web_search.",
  "You must not use tools.",
].join(" ");

export function parseTake(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("Take is not an object.");
  }
  const text = (value as { text?: unknown }).text;
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Take text is required.");
  }
  return jsonText(text).replace(/\s+/g, " ").trim().slice(0, 2000);
}

export function takeFail(error: unknown, at = new Date().toISOString()): TakeFail {
  const message =
    error instanceof Error && error.message.trim() !== "" ? error.message : "Take was not written.";
  return { status: "failed", message, at };
}

export function readTake(value: unknown): TakeRecord | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.status === "failed") {
    return {
      status: "failed",
      message: typeof rec.message === "string" && rec.message ? rec.message : "Take was not written.",
      at: typeof rec.at === "string" ? rec.at : "",
    };
  }
  if (rec.status === "ok" && typeof rec.text === "string" && rec.text.trim()) {
    return { status: "ok", text: rec.text.trim() };
  }
  return null;
}

export function takeText(record: TakeRecord | null | undefined) {
  return record?.status === "ok" ? record.text : "";
}

export function buildTakeRequest(input: ArticleWords) {
  return {
    model: grokModel,
    messages: [
      { role: "system", content: takeSystemPrompt },
      {
        role: "user",
        content: [input.headline, ...input.paragraphs].filter(Boolean).join("\n\n"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "issue_take",
        strict: true,
        schema: takeJsonSchema,
      },
    },
  };
}

export type GrokPost = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export async function runGrokTake(
  input: ArticleWords,
  deps?: { apiKey?: string; post?: GrokPost },
): Promise<string> {
  const apiKey = deps?.apiKey ?? serverEnv("XAI_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set");
  }

  const request = buildTakeRequest(input);
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
    throw new Error(`Grok take failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  const content = grokMessageContent(payload);
  return parseTake(JSON.parse(content) as unknown);
}

function grokMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Grok returned no take.");
  }
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Grok returned no take text.");
  }
  return content;
}
