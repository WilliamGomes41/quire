/**
 * Source headline from the kept document. og:title / title / h1.
 * Not Grok. Not invented. Empty vs fail. Keep still saves. PROTOCOL §3 / §9.
 */

import { couldNotReadHeadline } from "../copy";
import {
  compactText,
  isPublicHttpUrl,
  type ArticleGet,
} from "./article";

export type SourceHeadlineOk = {
  status: "ok";
  text: string;
  snippet?: string;
  figure?: string;
};

export type SourceHeadlineEmpty = {
  status: "empty";
  snippet?: string;
  figure?: string;
};

export type SourceHeadlineFail = {
  status: "failed";
  message: string;
  at: string;
};

export type SourceHeadlineRecord = SourceHeadlineOk | SourceHeadlineEmpty | SourceHeadlineFail;

export type SourceHeadlineFound = {
  text: string;
  snippet?: string;
  figure?: string;
};

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " "));
}

function attr(html: string, key: string, max = 400) {
  const named = html.match(
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
  );
  if (named?.[1]) return compactText(decodeEntities(named[1]), max);
  const contentFirst = html.match(
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    ),
  );
  return contentFirst?.[1] ? compactText(decodeEntities(contentFirst[1]), max) : "";
}

function mediaUrl(value: string, base: string) {
  const raw = compactText(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw, base || undefined);
    return isPublicHttpUrl(url.href) ? url.href : "";
  } catch {
    return "";
  }
}

function owned(found: Pick<SourceHeadlineFound, "snippet" | "figure">) {
  return {
    ...(found.snippet ? { snippet: found.snippet } : {}),
    ...(found.figure ? { figure: found.figure } : {}),
  };
}

function tagged(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return compactText(stripTags(match?.[1] ?? ""), 400);
}

function firstParagraph(html: string) {
  const match = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return compactText(stripTags(match?.[1] ?? ""), 500);
}

/**
 * Prefer og:title, then document title, then h1. Never the URL. Never invent.
 * Snippet is source-owned (first paragraph, else og:description).
 * Figure is og:image / twitter:image when the URL is already on the source.
 */
export function extractSourceHeadline(html: string, baseUrl = ""): SourceHeadlineFound {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text =
    attr(cleaned, "og:title") ||
    attr(cleaned, "twitter:title") ||
    tagged(cleaned, "title") ||
    tagged(cleaned, "h1");
  const snippet = firstParagraph(cleaned) || attr(cleaned, "og:description", 500);
  const figure = mediaUrl(attr(cleaned, "og:image", 2000) || attr(cleaned, "twitter:image", 2000), baseUrl);
  return {
    ...(text ? { text } : { text: "" }),
    ...owned({ snippet, figure }),
  };
}

export function sourceHeadlineFail(
  error: unknown,
  at = new Date().toISOString(),
): SourceHeadlineFail {
  const message =
    error instanceof Error && error.message.trim() !== ""
      ? error.message
      : couldNotReadHeadline;
  return { status: "failed", message, at };
}

export function sourceHeadlineRecord(found: SourceHeadlineFound): SourceHeadlineOk | SourceHeadlineEmpty {
  if (found.text) {
    return {
      status: "ok",
      text: found.text,
      ...owned(found),
    };
  }
  return {
    status: "empty",
    ...owned(found),
  };
}

function readOwned(rec: Record<string, unknown>) {
  const snippet = typeof rec.snippet === "string" ? rec.snippet.trim() : "";
  const figure =
    typeof rec.figure === "string" && isPublicHttpUrl(rec.figure.trim()) ? rec.figure.trim() : "";
  return owned({ snippet, figure });
}

export function readSourceHeadline(value: unknown): SourceHeadlineRecord | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.status === "ok" && typeof rec.text === "string" && rec.text.trim() !== "") {
    return {
      status: "ok",
      text: rec.text.trim(),
      ...readOwned(rec),
    };
  }
  if (rec.status === "empty") {
    return {
      status: "empty",
      ...readOwned(rec),
    };
  }
  if (rec.status === "failed") {
    return {
      status: "failed",
      message: typeof rec.message === "string" && rec.message ? rec.message : couldNotReadHeadline,
      at: typeof rec.at === "string" ? rec.at : "",
    };
  }
  return null;
}

export async function runSourceHeadline(input: {
  url: string;
  get?: ArticleGet;
  timeoutMs?: number;
}): Promise<SourceHeadlineRecord> {
  if (!isPublicHttpUrl(input.url)) {
    return sourceHeadlineFail(new Error(couldNotReadHeadline));
  }
  const timeoutMs = input.timeoutMs ?? 12_000;
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const get = input.get ?? fetch;
  const response = await get(input.url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`${couldNotReadHeadline} (${response.status})`);
  }
  const html = await response.text();
  return sourceHeadlineRecord(extractSourceHeadline(html, input.url));
}
