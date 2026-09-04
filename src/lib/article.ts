/**
 * Fetch the author's original words. Not a rewrite. Not a paste-up of fragments.
 * PROTOCOL §6 / §11.
 */

import { couldNotFetchWords } from "../copy";

export type FigureKind = "photo" | "diagram" | "chart";

export type BodyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "subhead"; text: string }
  | { kind: "pullQuote"; text: string };

export type ArticleWords = {
  url: string;
  headline: string;
  paragraphs: string[];
  figure?: string;
  figureCaption?: string;
  figureCredit?: string;
  figureKind?: FigureKind;
  publisher?: string;
  published?: string;
  pullQuotes?: string[];
  subheads?: string[];
  blocks?: BodyBlock[];
  videoUrl?: string;
};

/**
 * jsonb cannot store U+0000 or unpaired surrogates.
 * JSON.stringify turns those into \\u0000 / \\ud800; Postgres rejects the first
 * as "unsupported Unicode escape sequence". Strip only those. Author words stay.
 */
export function jsonText(value: string) {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i] + value[i + 1];
        i += 1;
        continue;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += value[i];
  }
  return out;
}

export function jsonValue<T>(value: T): T {
  if (typeof value === "string") return jsonText(value) as T;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item)]),
    ) as T;
  }
  return value;
}

export function compactText(value: unknown, max = 20_000) {
  return typeof value === "string" ? jsonText(value).replace(/\s+/g, " ").trim().slice(0, max) : "";
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

function absPublicUrl(raw: string, baseUrl: string) {
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

function bodyFrom(html: string): {
  paragraphs: string[];
  blocks?: BodyBlock[];
  pullQuotes?: string[];
  subheads?: string[];
} {
  const blocks: BodyBlock[] = [];
  const re = /<(p|h2|h3|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[1].toLowerCase();
    const limit = tag === "p" ? 8000 : 2000;
    const text = compactText(stripTags(match[2] ?? ""), limit);
    if (text.length <= 1) continue;
    if (tag === "p") blocks.push({ kind: "paragraph", text });
    else if (tag === "blockquote") blocks.push({ kind: "pullQuote", text });
    else blocks.push({ kind: "subhead", text });
  }
  const paragraphs = blocks.filter((block) => block.kind === "paragraph").map((block) => block.text);
  if (paragraphs.length === 0) {
    return { paragraphs: paragraphsFrom(html) };
  }
  const pullQuotes = blocks.filter((block) => block.kind === "pullQuote").map((block) => block.text);
  const subheads = blocks.filter((block) => block.kind === "subhead").map((block) => block.text);
  if (pullQuotes.length === 0 && subheads.length === 0) {
    return { paragraphs };
  }
  return {
    paragraphs,
    blocks,
    ...(pullQuotes.length ? { pullQuotes } : {}),
    ...(subheads.length ? { subheads } : {}),
  };
}

function figureCaptionFrom(html: string) {
  const caption = html.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
  if (caption?.[1]) return compactText(stripTags(caption[1]), 400);
  return metaContent(html, "og:image:alt", 400) || metaContent(html, "twitter:image:alt", 400);
}

function figureCreditFrom(html: string) {
  const cite = html.match(/<figure\b[\s\S]*?<cite\b[^>]*>([\s\S]*?)<\/cite>/i);
  if (cite?.[1]) return compactText(stripTags(cite[1]), 200);
  return (
    metaContent(html, "copyright", 200) ||
    metaContent(html, "credit", 200) ||
    metaContent(html, "image-credit", 200) ||
    metaContent(html, "photographer", 200)
  );
}

function figureKindFrom(caption: string, credit: string, url: string): FigureKind | undefined {
  const hay = `${caption} ${credit} ${url}`.toLowerCase();
  if (/\b(chart|graph|plot)\b/.test(hay)) return "chart";
  if (/\b(diagram|schematic|flowchart)\b/.test(hay)) return "diagram";
  return url ? "photo" : undefined;
}

function publisherFrom(html: string) {
  return (
    metaContent(html, "og:site_name", 120) ||
    metaContent(html, "publisher", 120) ||
    metaContent(html, "application-name", 120)
  );
}

function publishedFrom(html: string) {
  const time = html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i);
  return (
    metaContent(html, "article:published_time", 40) ||
    metaContent(html, "og:article:published_time", 40) ||
    metaContent(html, "datePublished", 40) ||
    metaContent(html, "article:published", 40) ||
    (time?.[1] ? compactText(decodeEntities(time[1]), 40) : "")
  );
}

function isVideoHost(hostname: string) {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "vimeo.com" ||
    host.endsWith(".vimeo.com")
  );
}

/** Source-owned video page or embed. Never invented. Public http only. */
export function videoFromHtml(html: string, baseUrl: string) {
  try {
    const page = new URL(baseUrl);
    if (isVideoHost(page.hostname)) return page.href;
  } catch {
    /* keep looking */
  }
  const type = metaContent(html, "og:type", 80).toLowerCase();
  if (type.startsWith("video")) {
    return absPublicUrl(baseUrl, baseUrl);
  }
  const tagged =
    metaContent(html, "og:video", 2000) ||
    metaContent(html, "og:video:url", 2000) ||
    metaContent(html, "twitter:player", 2000);
  const fromMeta = tagged ? absPublicUrl(tagged, baseUrl) : "";
  if (fromMeta) return fromMeta;
  const iframe = html.match(/<iframe\b[^>]*src=["']([^"']+)["']/i);
  if (iframe?.[1]) {
    try {
      const embed = new URL(iframe[1], baseUrl);
      if (isVideoHost(embed.hostname) && isPublicHttpUrl(embed.href)) return embed.href;
    } catch {
      return "";
    }
  }
  return "";
}

export function extractArticleWords(html: string, url: string): ArticleWords {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const scoped = sliceTagged(cleaned, "article") || sliceTagged(cleaned, "main") || cleaned;
  const headline = headlineFrom(scoped) || headlineFrom(cleaned);
  const body = bodyFrom(scoped);
  if (!headline && body.paragraphs.length === 0) {
    throw new Error(couldNotFetchWords);
  }
  const figure = figureFromHtml(cleaned, url);
  const caption = figure ? figureCaptionFrom(cleaned) : "";
  const credit = figure ? figureCreditFrom(cleaned) : "";
  const kind = figure ? figureKindFrom(caption, credit, figure) : undefined;
  const publisher = publisherFrom(cleaned);
  const published = publishedFrom(cleaned);
  const videoUrl = videoFromHtml(cleaned, url);
  return {
    url,
    headline: headline || compactText(url, 400),
    paragraphs: body.paragraphs,
    ...(body.blocks ? { blocks: body.blocks } : {}),
    ...(body.pullQuotes ? { pullQuotes: body.pullQuotes } : {}),
    ...(body.subheads ? { subheads: body.subheads } : {}),
    ...(figure ? { figure } : {}),
    ...(caption ? { figureCaption: caption } : {}),
    ...(credit ? { figureCredit: credit } : {}),
    ...(kind ? { figureKind: kind } : {}),
    ...(publisher ? { publisher } : {}),
    ...(published ? { published } : {}),
    ...(videoUrl ? { videoUrl } : {}),
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
