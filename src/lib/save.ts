import { keepNeedsUrl } from "../copy";
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
};

export type ClipStore = {
  insert: (clip: Clip) => Promise<Clip>;
  get: (id: string) => Promise<Clip | null>;
  persistUnderstanding: (id: string, record: UnderstandingRecord) => Promise<void>;
};

export type SaveOptions = {
  understand?: (input: { url: string }) => Promise<Understanding>;
};

function newId() {
  return crypto.randomUUID();
}

/**
 * Keep always saves. Persist first, then one Grok understanding.
 * Understanding success or a visible fail is persisted. PROTOCOL §3 / §9.
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
    understanding: null,
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

  const stored = await store.get(clip.id);
  if (!stored) {
    throw new Error("Keep did not persist.");
  }
  if (!stored.understanding && record) {
    return { ...stored, understanding: record };
  }
  return stored;
}
