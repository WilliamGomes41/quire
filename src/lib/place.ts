/**
 * Where a reader stopped in an issue or a kept piece: the sheet they last
 * turned to and, on a piece, the paragraph at the top of the screen.
 * Kept apart from the bookmark store, so the Read page bundle never pulls
 * in the database.
 */
export type SavedPlace = {
  sheet: number;
  /** Index of the paragraph in the piece's blocks, or null for the top of the sheet. */
  block: number | null;
  /** The paragraph's opening words, to check it is still the same text. */
  start: string | null;
};

const START_WORDS = 8;
const START_CHARS = 80;

/** The opening words of a paragraph, whitespace folded, short enough to store. */
export function blockStart(text: string): string {
  return text.trim().split(/\s+/).slice(0, START_WORDS).join(" ").slice(0, START_CHARS);
}

/** The paragraph on screen still opens with the words that were saved. */
export function blockMatches(text: string, start: string | null): boolean {
  if (!start) return false;
  return blockStart(text) === blockStart(start);
}

/** A sheet worth offering to go back to: past the cover and still in the issue. */
export function resumeSheet(bookmark: Pick<SavedPlace, "sheet"> | null, sheetCount: number): number | null {
  if (!bookmark) return null;
  const sheet = Math.trunc(bookmark.sheet);
  if (!Number.isFinite(sheet) || sheet <= 0 || sheet >= sheetCount) return null;
  return sheet;
}
