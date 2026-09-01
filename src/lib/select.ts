/**
 * Select is an editorial choice. Original in by default. Related only when selected.
 * Suggestions stay suggestions until selected. PROTOCOL §2 / §5.
 */

import { canonicalizeUrl } from "./article";
import type { Clip } from "./save";

export type BindChoice = {
  includeOriginal: boolean;
  relatedUrls: string[];
};

export type ChosenPiece = {
  url: string;
  role: "original" | "related";
};

export function defaultBindChoice(): BindChoice {
  return { includeOriginal: true, relatedUrls: [] };
}

export function readBindChoice(input?: Partial<BindChoice> | null): BindChoice {
  return {
    includeOriginal: input?.includeOriginal !== false,
    relatedUrls: Array.isArray(input?.relatedUrls) ? input.relatedUrls : [],
  };
}

export function chosenPieces(clip: Clip, choice?: Partial<BindChoice> | null): ChosenPiece[] {
  const selected = readBindChoice(choice);
  const seen = new Set<string>();
  const pieces: ChosenPiece[] = [];

  const add = (url: string, role: ChosenPiece["role"]) => {
    const key = canonicalizeUrl(url);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pieces.push({ url, role });
  };

  if (selected.includeOriginal) {
    add(clip.url, "original");
  }

  const allowed = new Set(
    (clip.relatedReporting ?? []).map((page) => canonicalizeUrl(page.url)).filter(Boolean),
  );
  for (const url of selected.relatedUrls) {
    const key = canonicalizeUrl(url);
    if (!key || !allowed.has(key)) continue;
    add(url, "related");
  }

  return pieces;
}
