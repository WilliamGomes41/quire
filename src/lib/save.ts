import { keepNeedsUrl } from "../copy";
import { isPublicHttpUrl, type ClaimSource } from "./article";
import {
  relatedFail,
  relatedPersist,
  runRelatedReporting,
  type RelatedJudgeFn,
  type RelatedPage,
  type RelatedRailFail,
  type RelatedRailRecord,
} from "./related";
import { runGrokRelatedQueries, type RelatedSearchStringsFn } from "./related-queries";
import { runGrokRelatedStance, type RelatedStanceFn } from "./related-stance";
import { resolveSearchPages, type SearchPages } from "./search";
import {
  runKeepSource,
  sourceHeadlineFail,
  sourceHeadlineRecord,
  type SourceHeadlineFound,
  type SourceHeadlineRecord,
} from "./source-headline";
import {
  runGrokUnderstanding,
  understandingFail,
  type UnderstandInput,
  type Understanding,
  type UnderstandingRecord,
} from "./understanding";

export type Clip = {
  id: string;
  url: string;
  savedAt: string;
  understanding: UnderstandingRecord | null;
  relatedRail: RelatedRailFail | { status: "ok" } | null;
  relatedReporting: RelatedPage[] | null;
  sourceHeadline: SourceHeadlineRecord | null;
};

export type ClipStore = {
  insert: (clip: Clip) => Promise<Clip>;
  get: (id: string) => Promise<Clip | null>;
  persistUnderstanding: (id: string, record: UnderstandingRecord) => Promise<void>;
  persistRelated: (id: string, record: RelatedRailRecord) => Promise<void>;
  persistSourceHeadline: (id: string, record: SourceHeadlineRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export type SaveOptions = {
  understand?: (input: UnderstandInput) => Promise<Understanding>;
  searchPages?: SearchPages;
  searchStrings?: RelatedSearchStringsFn;
  judge?: RelatedJudgeFn;
  labelStance?: RelatedStanceFn;
  readHeadline?: (input: { url: string }) => Promise<SourceHeadlineFound>;
  readSource?: (input: { url: string }) => Promise<{ found: SourceHeadlineFound; source: ClaimSource }>;
  /** Called once per Keep with how long each step took. */
  onTiming?: (timing: KeepTiming) => void;
};

/** Milliseconds per Keep step; search strings, search, and judge are the parts of the rail. */
export type KeepTiming = {
  url: string;
  source: number;
  understand: number;
  searchStrings: number;
  search: number;
  judge: number;
  total: number;
};

/** One log line, e.g. "keep 14.2s · source 0.8s · understand 5.1s · ... (example.com)". */
export function formatKeepTiming(timing: KeepTiming): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  let host = "";
  try {
    host = new URL(timing.url).hostname;
  } catch {
    // Timing still logs without a host.
  }
  return [
    `keep ${s(timing.total)}`,
    `source ${s(timing.source)}`,
    `understand ${s(timing.understand)}`,
    `search strings ${s(timing.searchStrings)}`,
    `search ${s(timing.search)}`,
    `judge ${s(timing.judge)}`,
  ].join(" · ") + (host ? ` (${host})` : "");
}

/** Wall time spent in fn: calls that overlap (both searches at once) count once. */
function timed<A extends unknown[], R>(fn: (...args: A) => Promise<R>, add: (ms: number) => void) {
  let running = 0;
  let since = 0;
  return async (...args: A): Promise<R> => {
    if (running++ === 0) since = performance.now();
    try {
      return await fn(...args);
    } finally {
      if (--running === 0) add(performance.now() - since);
    }
  };
}

/** Longer than any real article URL; keeps junk out of the store. */
export const KEEP_URL_MAX = 2048;

function newId() {
  return crypto.randomUUID();
}

function emptyClipFields() {
  return {
    understanding: null,
    relatedRail: null,
    relatedReporting: null,
    sourceHeadline: null,
  };
}

/**
 * Keep always saves. Persist first, then a source headline from the fetch,
 * then one Grok understanding grounded in source text, then claim-driven
 * search strings, then the search rail, then one bounded Grok judge.
 * Missing claims prefer an empty rail over entity-junk.
 * Headline, understanding, Grok-string, search, and judge failure do not fail Keep.
 */
export async function saveClip(
  input: { url: string },
  store: ClipStore,
  options?: SaveOptions,
): Promise<Clip> {
  return enrichClip(await keepClip(input, store), store, options);
}

/** The quick half of Keep: check the URL and persist the clip, nothing fetched yet. */
export async function keepClip(input: { url: string }, store: ClipStore): Promise<Clip> {
  const url = input.url.trim();
  if (!url || url.length > KEEP_URL_MAX || !isPublicHttpUrl(url)) {
    throw new Error(keepNeedsUrl);
  }
  return store.insert({
    id: newId(),
    url,
    savedAt: new Date().toISOString(),
    ...emptyClipFields(),
  });
}

/**
 * The slow half of Keep, for a clip keepClip persisted. Each step persists as
 * it lands, so a desk that reloads meanwhile sees the card fill in; the
 * related rail is written last.
 */
export async function enrichClip(
  clip: Clip,
  store: ClipStore,
  options?: SaveOptions,
): Promise<Clip> {
  const started = performance.now();
  const timing: KeepTiming = {
    url: clip.url,
    source: 0,
    understand: 0,
    searchStrings: 0,
    search: 0,
    judge: 0,
    total: 0,
  };
  let mark = started;
  const lap = () => {
    const now = performance.now();
    const ms = now - mark;
    mark = now;
    return ms;
  };

  let headline: SourceHeadlineRecord | null = null;
  let source: ClaimSource | undefined;
  try {
    if (options?.readSource) {
      const keep = await options.readSource({ url: clip.url });
      source = keep.source;
      headline = sourceHeadlineRecord(keep.found);
    } else if (options?.readHeadline) {
      headline = sourceHeadlineRecord(await options.readHeadline({ url: clip.url }));
    } else {
      const keep = await runKeepSource({ url: clip.url });
      source = keep.source;
      headline = sourceHeadlineRecord(keep.found);
    }
    await store.persistSourceHeadline(clip.id, headline);
  } catch (error) {
    headline = sourceHeadlineFail(error);
    try {
      await store.persistSourceHeadline(clip.id, headline);
    } catch {
      // Keep stands. The fail still returns on the clip below.
    }
  }
  timing.source = lap();

  const understand = options?.understand ?? runGrokUnderstanding;
  let record: UnderstandingRecord | null = null;
  try {
    const understood = await understand({ url: clip.url, source });
    record = { status: "ok", ...understood };
  } catch (error) {
    record = understandingFail(error);
  }
  if (record) {
    try {
      await store.persistUnderstanding(clip.id, record);
    } catch {
      // Keep stands. An ok characterization is not rewritten as fail.
    }
  }
  timing.understand = lap();

  const searchPages = timed(options?.searchPages ?? resolveSearchPages(), (ms) => {
    timing.search += ms;
  });
  const searchStrings = timed(options?.searchStrings ?? runGrokRelatedQueries, (ms) => {
    timing.searchStrings += ms;
  });
  const judge = timed(options?.judge ?? options?.labelStance ?? runGrokRelatedStance, (ms) => {
    timing.judge += ms;
  });
  let related: RelatedRailRecord | null = null;
  try {
    related = await runRelatedReporting({
      url: clip.url,
      topic: record?.status === "ok" ? record : null,
      headline: headline?.status === "ok" ? headline.text : undefined,
      searchPages,
      searchStrings,
      judge,
    });
  } catch (error) {
    related = relatedFail(error);
  }
  if (related) {
    try {
      await store.persistRelated(clip.id, related);
    } catch {
      // Keep stands. The rail still returns on the clip below.
    }
  }

  timing.total = performance.now() - started;
  options?.onTiming?.(timing);

  const stored = await store.get(clip.id);
  if (!stored) {
    throw new Error("Keep did not persist.");
  }

  let next = stored;
  if (!stored.sourceHeadline && headline) {
    next = { ...next, sourceHeadline: headline };
  }
  if (!stored.understanding && record) {
    next = { ...next, understanding: record };
  }
  if (!stored.relatedRail && related) {
    const write = relatedPersist(related);
    next = {
      ...next,
      relatedRail: write.related_rail,
      relatedReporting: write.related_reporting ?? stored.relatedReporting,
    };
  }
  return next;
}
