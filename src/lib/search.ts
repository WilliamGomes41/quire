/**
 * Retrieval is a provider slot: a function type plus config.
 * Day one: one dedicated search API. More APIs register here later.
 * Not a class per vendor. PROTOCOL §4 / §10.
 */

import { serverEnv } from "./server-env";

export type RawPage = {
  url: string;
  title?: string;
  snippet?: string;
  date?: string;
};

export type SearchPages = (input: { query: string }) => Promise<RawPage[]>;

export type SearchSlotConfig = {
  api?: string;
  apiKey?: string;
  apiUrl?: string;
  timeoutMs?: number;
  get?: typeof fetch;
};

export const defaultSearchApiUrl = "https://api.search.brave.com/res/v1/web/search";
export const searchTimeoutMs = 12_000;
export const searchRawLimit = 20;

export type SearchFailStatus = "failed" | "unconfigured" | "timeout";

export function searchLookupError(status: SearchFailStatus, message: string) {
  return Object.assign(new Error(message), { status });
}

function failStatusOf(error: unknown): SearchFailStatus {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: string }).status;
    if (status === "unconfigured" || status === "timeout" || status === "failed") {
      return status;
    }
  }
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") return "timeout";
  }
  return "failed";
}

export function searchFailStatus(error: unknown): SearchFailStatus {
  return failStatusOf(error);
}

/** Keep a calendar date already on the page. Do not invent one from "2 days ago". */
export function pageDate(row: Record<string, unknown>) {
  for (const key of ["page_age", "date", "published", "published_date"]) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return "";
}

function readPages(payload: unknown): RawPage[] {
  if (!payload || typeof payload !== "object") {
    throw searchLookupError("failed", "Search API returned no pages.");
  }
  const rec = payload as Record<string, unknown>;
  const web = rec.web && typeof rec.web === "object" ? (rec.web as Record<string, unknown>).results : undefined;
  const raw = Array.isArray(web)
    ? web
    : Array.isArray(rec.results)
      ? rec.results
      : Array.isArray(rec.organic)
        ? rec.organic
        : Array.isArray(payload)
          ? payload
          : null;
  if (!raw) {
    throw searchLookupError("failed", "Search API page list is missing.");
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : typeof row.link === "string" ? row.link : "";
    if (!url) return [];
    const title = typeof row.title === "string" ? row.title : undefined;
    const snippet =
      typeof row.snippet === "string"
        ? row.snippet
        : typeof row.description === "string"
          ? row.description
          : undefined;
    const date = pageDate(row);
    return [
      {
        url,
        ...(title ? { title } : {}),
        ...(snippet ? { snippet } : {}),
        ...(date ? { date } : {}),
      },
    ];
  });
}

/** Day-one dedicated search API. Finds pages (raw). The app ranks. */
export function pagesFromSearchApi(config: SearchSlotConfig = {}): SearchPages {
  return async ({ query }) => {
    const apiKey = config.apiKey ?? serverEnv("SEARCH_API_KEY") ?? serverEnv("BRAVE_SEARCH_API_KEY");
    if (!apiKey) {
      throw searchLookupError("unconfigured", "SEARCH_API_KEY is not set");
    }
    const q = query.trim();
    if (!q) {
      throw searchLookupError("failed", "Search query is empty.");
    }

    const endpoint = new URL(config.apiUrl ?? serverEnv("SEARCH_API_URL") ?? defaultSearchApiUrl);
    endpoint.searchParams.set("q", q);
    endpoint.searchParams.set("count", String(searchRawLimit));

    const timeoutMs = config.timeoutMs ?? searchTimeoutMs;
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    const get = config.get ?? fetch;

    let response: Response;
    try {
      response = await get(endpoint.href, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
      });
    } catch (error) {
      throw searchLookupError(failStatusOf(error), error instanceof Error ? error.message : "Search API request failed.");
    }

    if (!response.ok) {
      throw searchLookupError("failed", `Search API failed (${response.status})`);
    }

    return readPages(await response.json());
  };
}

/** Slot registry. Add another function here to fill the slot with a later API. */
export const searchApis: Record<string, (config?: SearchSlotConfig) => SearchPages> = {
  search_api: pagesFromSearchApi,
};

export function resolveSearchPages(config: SearchSlotConfig = {}): SearchPages {
  const id = config.api ?? serverEnv("SEARCH_PROVIDER") ?? "search_api";
  const factory = searchApis[id];
  if (!factory) {
    return async () => {
      throw searchLookupError("unconfigured", `Search provider ${id} is not in the slot`);
    };
  }
  return factory(config);
}
