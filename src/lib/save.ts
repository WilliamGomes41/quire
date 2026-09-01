import { keepNeedsUrl } from "../copy";

export type Clip = {
  id: string;
  url: string;
  savedAt: string;
};

export type ClipStore = {
  insert: (clip: Clip) => Promise<Clip>;
  get: (id: string) => Promise<Clip | null>;
};

export type AfterSave = {
  grok?: () => Promise<unknown>;
  search?: () => Promise<unknown>;
};

function newId() {
  return crypto.randomUUID();
}

/**
 * Keep always saves. Persist first. Grok, search, and other
 * enrichment may fail; the clip stays. PROTOCOL §3.
 */
export async function saveClip(
  input: { url: string },
  store: ClipStore,
  afterSave?: AfterSave,
): Promise<Clip> {
  const url = input.url.trim();
  if (!url) {
    throw new Error(keepNeedsUrl);
  }

  const clip = await store.insert({
    id: newId(),
    url,
    savedAt: new Date().toISOString(),
  });

  if (afterSave?.grok) {
    try {
      await afterSave.grok();
    } catch {
      // Keep stands.
    }
  }

  if (afterSave?.search) {
    try {
      await afterSave.search();
    } catch {
      // Keep stands.
    }
  }

  const stored = await store.get(clip.id);
  if (!stored) {
    throw new Error("Keep did not persist.");
  }
  return stored;
}
