import { keepNeedsUrl } from "../copy";
import {
  relatedFail,
  relatedPersist,
  runRelatedReporting,
  type RelatedPage,
  type RelatedRailFail,
  type RelatedRailRecord,
} from "./related";
import { runGrokRelatedQueries, type RelatedSearchStringsFn } from "./related-queries";
import { applyRelatedStances, runGrokRelatedStance, type RelatedStanceFn } from "./related-stance";
import { resolveSearchPages, type SearchPages } from "./search";
import {
  runSourceHeadline,
  sourceHeadlineFail,
  sourceHeadlineRecord,
  type SourceHeadlineFound,
  type SourceHeadlineRecord,
} from "./source-headline";
import {
  runGrokUnderstanding,
  understandingFail,
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
  understand?: (input: { url: string }) => Promise<Understanding>;
  searchPages?: SearchPages;
  searchStrings?: RelatedSearchStringsFn;
  labelStance?: RelatedStanceFn;
  readHeadline?: (input: { url: string }) => Promise<SourceHeadlineFound>;
};

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
 * then one Grok understanding, then two short search strings, then the search rail,
 * then one fail-closed stance label on already-retrieved pages.
 * If the two strings are missing, the rail falls back to the topic query.
 * Label failure leaves the rail ok without stance fields.
 * Headline, Grok-string, search, and label failure do not fail Keep.
 */
export async function saveClip(
  input: { url: string },
  store: ClipStore,
  options?: SaveOptions,
): Promise<Clip> {
  const url = input.url.trim();
  if (!url) {
    throw new Error(keepNeedsUrl);
  }

  const clip = await store.insert({
    id: newId(),
    url,
    savedAt: new Date().toISOString(),
    ...emptyClipFields(),
  });

  let headline: SourceHeadlineRecord | null = null;
  try {
    headline = options?.readHeadline
      ? sourceHeadlineRecord(await options.readHeadline({ url: clip.url }))
      : await runSourceHeadline({ url: clip.url });
    await store.persistSourceHeadline(clip.id, headline);
  } catch (error) {
    headline = sourceHeadlineFail(error);
    try {
      await store.persistSourceHeadline(clip.id, headline);
    } catch {
      // Keep stands. The fail still returns on the clip below.
    }
  }

  const understand = options?.understand ?? runGrokUnderstanding;
  let record: UnderstandingRecord | null = null;
  try {
    const understood = await understand({ url: clip.url });
    record = { status: "ok", ...understood };
    await store.persistUnderstanding(clip.id, record);
  } catch (error) {
    record = understandingFail(error);
    try {
      await store.persistUnderstanding(clip.id, record);
    } catch {
      // Keep stands. The fail still returns on the clip below.
    }
  }

  const searchPages = options?.searchPages ?? resolveSearchPages();
  const searchStrings = options?.searchStrings ?? runGrokRelatedQueries;
  const labelStance = options?.labelStance ?? runGrokRelatedStance;
  let related: RelatedRailRecord | null = null;
  try {
    related = await runRelatedReporting({
      url: clip.url,
      topic: record?.status === "ok" ? record : null,
      searchPages,
      searchStrings,
    });
  } catch (error) {
    related = relatedFail(error);
  }
  if (related?.status === "ok" && related.related_reporting.length >= 1) {
    try {
      const labeled = await labelStance(related.related_reporting, {
        topic: record?.status === "ok" ? record : null,
        headline: headline?.status === "ok" ? headline.text : undefined,
      });
      related = {
        status: "ok",
        related_reporting: applyRelatedStances(
          related.related_reporting,
          labeled.flatMap((page) => (page.stance ? [{ url: page.url, stance: page.stance }] : [])),
        ),
      };
    } catch {
      // Rail stays ok. No stance fields. Keep saves.
    }
  }
  if (related) {
    try {
      await store.persistRelated(clip.id, related);
    } catch {
      // Keep stands. The rail still returns on the clip below.
    }
  }

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
