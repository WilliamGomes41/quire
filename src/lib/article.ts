/**
 * Fetch the author's original words. Not a rewrite. Not a paste-up of fragments.
 * PROTOCOL §6 / §11.
 */

import { couldNotFetchWords } from "../copy";

export type ArticleWords = {
  url: string;
  headline: string;
  paragraphs: string[];
  figure?: string;
};

export function compactText(value: unknown, max = 20_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Tags off. Entities decoded. Never invented. */
export function plainText(value: unknown, max = 20_000) {
  if (typeof value !== "string") return "";
  return compactText(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+([.,;:!?])/g, "$1"),
    max,
  );
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch {
    return "";
  }
}

export function isPublicHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "metadata.google.internal"
  ) {
    return false;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

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

function sliceTagged(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1] ?? "";
}

function headlineFrom(html: string) {
  const h1 = compactText(stripTags(sliceTagged(html, "h1")), 400);
  if (h1) return h1;
  return compactText(stripTags(sliceTagged(html, "title")), 400);
}

function metaContent(html: string, key: string, max = 2000) {
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

/** Source-owned figure already on the page. Never invented. Public http only. */
export function figureFromHtml(html: string, baseUrl: string) {
  const raw = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  if (!raw) return "";
  try {
    const url = new URL(raw, baseUrl || undefined);
    return isPublicHttpUrl(url.href) ? url.href : "";
  } catch {
    return "";
  }
}

function paragraphsFrom(html: string) {
  const fromP = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => compactText(stripTags(match[1]), 8000))
    .filter((text) => text.length > 1);
  if (fromP.length > 0) return fromP;
  const text = compactText(stripTags(html), 20_000);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => compactText(part, 8000))
    .filter((part) => part.length > 1);
}

export function extractArticleWords(html: string, url: string): ArticleWords {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const scoped = sliceTagged(cleaned, "article") || sliceTagged(cleaned, "main") || cleaned;
  const headline = headlineFrom(scoped) || headlineFrom(cleaned);
  const paragraphs = paragraphsFrom(scoped);
  if (!headline && paragraphs.length === 0) {
    throw new Error(couldNotFetchWords);
  }
  const figure = figureFromHtml(cleaned, url);
  return {
    url,
    headline: headline || compactText(url, 400),
    paragraphs,
    ...(figure ? { figure } : {}),
  };
}

export type ArticleGet = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

export async function fetchArticleWords(
  url: string,
  deps?: { get?: ArticleGet; timeoutMs?: number },
): Promise<ArticleWords> {
  if (!isPublicHttpUrl(url)) {
    throw new Error(couldNotFetchWords);
  }
  const timeoutMs = deps?.timeoutMs ?? 12_000;
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const get = deps?.get ?? fetch;
  const response = await get(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`${couldNotFetchWords} (${response.status})`);
  }
  const html = await response.text();
  const words = extractArticleWords(html, url);
  if (words.paragraphs.length === 0) {
    throw new Error(couldNotFetchWords);
  }
  return words;
}
