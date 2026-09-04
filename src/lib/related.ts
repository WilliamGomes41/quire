import { couldNotLook } from "../copy";
import { plainText } from "./article";
import { searchFailStatus, type SearchPages } from "./search";
import type { Understanding } from "./understanding";

export const RELATED_REPORTING_MAX = 5;

export type RelatedPage = {
  url: string;
  title?: string;
  snippet?: string;
  date?: string;
};

export type RelatedRailOk = {
  status: "ok";
  related_reporting: RelatedPage[];
};

export type RelatedRailFail = {
  status: "failed" | "unconfigured" | "timeout";
  message: string;
  at: string;
};

export type RelatedRailRecord = RelatedRailOk | RelatedRailFail;

export type RelatedPersist = {
  related_rail: RelatedRailFail | { status: "ok" };
  related_reporting?: RelatedPage[];
};

function compact(value: unknown, max: number) {
  return plainText(value, max);
}

function canonicalizeUrl(value: string) {
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

function tokens(value: string) {
  return compact(value, 2000)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2);
}

/** Host labels that are not an author. Publishing platforms and common public suffixes. */
const hostNoise = new Set([
  "www",
  "com",
  "org",
  "net",
  "io",
  "co",
  "uk",
  "nl",
  "de",
  "substack",
  "medium",
  "wordpress",
  "blogspot",
  "github",
  "ghost",
  "beehiiv",
  "hashnode",
]);

const pathNoise = new Set(["p", "posts", "post", "article", "articles", "blog", "news", "index", "amp", "html"]);

/** Author-looking tokens from the keep hostname. williamgomes1.substack.com → williamgomes. */
function hostAuthorTokens(url: string) {
  const junk = new Set<string>();
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return junk;
  }
  for (const label of hostname.split(".")) {
    if (!label || hostNoise.has(label)) continue;
    junk.add(label);
    const squeezed = label.replace(/[^a-z]+/gi, "").toLowerCase();
    if (squeezed.length > 2) junk.add(squeezed);
    for (const token of tokens(label)) {
      junk.add(token);
      const bare = token.replace(/\d+/g, "");
      if (bare.length > 2) junk.add(bare);
    }
  }
  return junk;
}

function looksLikeHostAuthor(value: string, junk: Set<string>) {
  if (junk.size === 0) return false;
  const parts = tokens(value);
  if (parts.some((part) => junk.has(part))) return true;
  const joined = parts.join("");
  return Boolean(joined && junk.has(joined));
}

function stripHostAuthor(text: string, junk: Set<string>, max: number) {
  const cleaned = compact(text, max);
  if (!cleaned || junk.size === 0) return cleaned;
  const words = cleaned.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  let index = 0;
  while (index < words.length) {
    let skip = 0;
    for (let take = Math.min(3, words.length - index); take >= 1; take -= 1) {
      if (looksLikeHostAuthor(words.slice(index, index + take).join(" "), junk)) {
        skip = take;
        break;
      }
    }
    if (skip) {
      index += skip;
      continue;
    }
    kept.push(words[index]);
    index += 1;
  }
  return compact(kept.join(" "), max);
}

function remainingEntities(topic: Understanding | null | undefined, junk: Set<string>) {
  return (topic?.entities ?? [])
    .map((item) => compact(item, 80))
    .filter((item) => item && !looksLikeHostAuthor(item, junk))
    .slice(0, 4);
}

/** Path words only. Never the keep host. */
function pathFallback(url: string, junk: Set<string>) {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return "";
  }
  const parts = path
    .split("/")
    .flatMap((part) => part.replace(/\.[a-z0-9]+$/i, "").split(/[-_]+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !pathNoise.has(part.toLowerCase()));
  return compact(parts.filter((part) => !looksLikeHostAuthor(part, junk)).join(" "), 320);
}

function wantedTokens(keepUrl: string, topic?: Understanding | null) {
  const junk = hostAuthorTokens(keepUrl);
  const topicText = stripHostAuthor(topic?.topic ?? "", junk, 180);
  return new Set(tokens([topicText, ...remainingEntities(topic, junk)].join(" ")));
}

function overlapScore(page: RelatedPage, wanted: Set<string>) {
  if (wanted.size === 0) return 0;
  const have = new Set(tokens([page.title ?? "", page.snippet ?? ""].join(" ")));
  let hit = 0;
  for (const token of wanted) {
    if (have.has(token)) hit += 1;
  }
  return hit / wanted.size;
}

/**
 * Topic + remaining entities + date.
 * Do not feed keep-host / author-looking tokens (williamgomes from a Substack host).
 * Empty topic falls back to the path, never the raw URL host.
 */
export function buildSearchQuery(input: { url: string; topic?: Understanding | null }) {
  const junk = hostAuthorTokens(input.url);
  const topic = stripHostAuthor(input.topic?.topic ?? "", junk, 180);
  const entities = remainingEntities(input.topic, junk);
  const date = compact(input.topic?.date, 10);
  if (topic) {
    return compact([topic, ...entities, date].filter(Boolean).join(" "), 320);
  }
  return compact([...entities, pathFallback(input.url, junk), date].filter(Boolean).join(" "), 320);
}

export function normalizeRelated(
  raw: { url?: string; title?: string; snippet?: string; date?: string }[],
  keepUrl: string,
) {
  const keep = canonicalizeUrl(keepUrl);
  const pages: RelatedPage[] = [];
  for (const item of raw) {
    const url = canonicalizeUrl(item.url ?? "");
    if (!url || url === keep) continue;
    const title = compact(item.title, 500);
    const snippet = compact(item.snippet, 1000);
    const date = compact(item.date, 10);
    pages.push({
      url,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {}),
      ...(date ? { date } : {}),
    });
  }
  return pages;
}

export function dedupeRelated(pages: RelatedPage[]) {
  const seen = new Set<string>();
  const unique: RelatedPage[] = [];
  for (const page of pages) {
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    unique.push(page);
  }
  return unique;
}

function scorePage(page: RelatedPage, topic?: Understanding | null) {
  if (!topic?.topic) return 0;
  const wanted = new Set(tokens([topic.topic, ...(topic.entities ?? [])].join(" ")));
  return overlapScore(page, wanted);
}

export function rankRelated(pages: RelatedPage[], topic?: Understanding | null) {
  return [...pages]
    .map((page, index) => ({ page, index, score: scorePage(page, topic) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((row) => row.page);
}

/** After rank. Drop zero overlap with topic / remaining entities. Prefer fewer over junk. */
export function dropZeroOverlap(
  pages: RelatedPage[],
  topic?: Understanding | null,
  keepUrl = "",
) {
  const wanted = wantedTokens(keepUrl, topic);
  if (wanted.size === 0) return [];
  return pages.filter((page) => overlapScore(page, wanted) > 0);
}

export function relatedFail(error: unknown, at = new Date().toISOString()): RelatedRailFail {
  const status = searchFailStatus(error);
  const message =
    error instanceof Error && error.message.trim() !== "" ? error.message : couldNotLook;
  return { status, message, at };
}

/** Fail-closed: only ok writes related_reporting. failed is not ok+0. */
export function relatedPersist(record: RelatedRailRecord): RelatedPersist {
  if (record.status === "ok") {
    return {
      related_rail: { status: "ok" },
      related_reporting: record.related_reporting.slice(0, RELATED_REPORTING_MAX),
    };
  }
  return {
    related_rail: {
      status: record.status,
      message: record.message,
      at: record.at,
    },
  };
}

export function readRelatedRail(value: unknown): RelatedRailFail | { status: "ok" } | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec.status === "ok") return { status: "ok" };
  if (rec.status === "failed" || rec.status === "unconfigured" || rec.status === "timeout") {
    return {
      status: rec.status,
      message: typeof rec.message === "string" && rec.message ? rec.message : couldNotLook,
      at: typeof rec.at === "string" ? rec.at : "",
    };
  }
  return null;
}

export function readRelatedReporting(value: unknown): RelatedPage[] | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return null;
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    if (typeof rec.url !== "string" || !rec.url) return [];
    return [
      {
        url: rec.url,
        ...(typeof rec.title === "string" && rec.title ? { title: rec.title } : {}),
        ...(typeof rec.snippet === "string" && rec.snippet ? { snippet: rec.snippet } : {}),
        ...(typeof rec.date === "string" && rec.date ? { date: rec.date } : {}),
      },
    ];
  });
}

export async function runRelatedReporting(input: {
  url: string;
  topic?: Understanding | null;
  searchPages: SearchPages;
}): Promise<RelatedRailRecord> {
  const query = buildSearchQuery({ url: input.url, topic: input.topic });
  if (!query) {
    return { status: "ok", related_reporting: [] };
  }
  let raw;
  try {
    raw = await input.searchPages({ query });
  } catch (error) {
    return relatedFail(error);
  }
  const related_reporting = dropZeroOverlap(
    rankRelated(dedupeRelated(normalizeRelated(raw, input.url)), input.topic),
    input.topic,
    input.url,
  ).slice(0, RELATED_REPORTING_MAX);
  return { status: "ok", related_reporting };
}
