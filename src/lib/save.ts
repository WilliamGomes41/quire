import { keepNeedsUrl } from "../copy";
import {
  relatedFail,
  relatedPersist,
  runRelatedReporting,
  type RelatedPage,
  type RelatedRailFail,
  type RelatedRailRecord,
} from "./related";
import { resolveSearchPages, type SearchPages } from "./search";
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
};

export type ClipStore = {
  insert: (clip: Clip) => Promise<Clip>;
  get: (id: string) => Promise<Clip | null>;
  persistUnderstanding: (id: string, record: UnderstandingRecord) => Promise<void>;
  persistRelated: (id: string, record: RelatedRailRecord) => Promise<void>;
};

export type SaveOptions = {
  understand?: (input: { url: string }) => Promise<Understanding>;
  searchPages?: SearchPages;
};

function newId() {
  return crypto.randomUUID();
}

function emptyClipFields() {
  return {
    understanding: null,
    relatedRail: null,
    relatedReporting: null,
  };
}

/**
 * Keep always saves. Persist first, then one Grok understanding, then the search rail.
 * Search failure does not fail Keep. PROTOCOL §3 / §4 / §9.
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
  let related: RelatedRailRecord | null = null;
  try {
    related = await runRelatedReporting({
      url: clip.url,
      topic: record?.status === "ok" ? record : null,
      searchPages,
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

  const stored = await store.get(clip.id);
  if (!stored) {
    throw new Error("Keep did not persist.");
  }

  let next = stored;
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
