import { couldNotLook } from "../copy";
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
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
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

export function buildSearchQuery(input: { url: string; topic?: Understanding | null }) {
  const topic = compact(input.topic?.topic, 180);
  if (!topic) return compact(input.url, 320);
  const entities = (input.topic?.entities ?? []).map((item) => compact(item, 80)).filter(Boolean).slice(0, 4);
  const date = compact(input.topic?.date, 10);
  return compact([topic, ...entities, date].filter(Boolean).join(" "), 320);
}

export function normalizeRelated(raw: { url?: string; title?: string; snippet?: string }[], keepUrl: string) {
  const keep = canonicalizeUrl(keepUrl);
  const pages: RelatedPage[] = [];
  for (const item of raw) {
    const url = canonicalizeUrl(item.url ?? "");
    if (!url || url === keep) continue;
    const title = compact(item.title, 500);
    const snippet = compact(item.snippet, 1000);
    pages.push({
      url,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {}),
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
  if (wanted.size === 0) return 0;
  const have = new Set(tokens([page.title ?? "", page.snippet ?? ""].join(" ")));
  let hit = 0;
  for (const token of wanted) {
    if (have.has(token)) hit += 1;
  }
  return hit / wanted.size;
}

export function rankRelated(pages: RelatedPage[], topic?: Understanding | null) {
  return [...pages]
    .map((page, index) => ({ page, index, score: scorePage(page, topic) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((row) => row.page);
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
  let raw;
  try {
    raw = await input.searchPages({ query });
  } catch (error) {
    return relatedFail(error);
  }
  const related_reporting = rankRelated(
    dedupeRelated(normalizeRelated(raw, input.url)),
    input.topic,
  ).slice(0, RELATED_REPORTING_MAX);
  return { status: "ok", related_reporting };
}
