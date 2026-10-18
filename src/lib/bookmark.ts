import { openDb } from "./db";
import { blockStart, type SavedPlace } from "./place";

export { blockMatches, blockStart, resumeSheet, type SavedPlace } from "./place";

/**
 * A reader's place, stored one row per reader per item, so it follows the
 * reader from device to device.
 */
export type Bookmark = SavedPlace & {
  readerId: string;
  itemId: string;
  savedAt: string;
};

export type BookmarkStore = {
  get: (readerId: string, itemId: string) => Promise<Bookmark | null>;
  set: (readerId: string, itemId: string, place: SavedPlace) => Promise<Bookmark>;
  removeItem: (itemId: string) => Promise<void>;
};

function bookmarkFromRow(row: Record<string, unknown>): Bookmark {
  const block = row.block === null || row.block === undefined ? null : Number(row.block);
  return {
    readerId: String(row.reader_id),
    itemId: String(row.item_id),
    sheet: Number(row.sheet),
    block: block !== null && Number.isFinite(block) ? block : null,
    start: typeof row.block_start === "string" ? row.block_start : null,
    savedAt: new Date(String(row.saved_at)).toISOString(),
  };
}

export async function bookmarkStore(): Promise<BookmarkStore> {
  const db = await openDb();
  return {
    async get(readerId, itemId) {
      if (!readerId || !itemId) return null;
      const { rows } = await db.query(
        "select reader_id, item_id, sheet, block, block_start, saved_at from bookmarks where reader_id = $1 and item_id = $2",
        [readerId, itemId],
      );
      const row = rows[0];
      return row ? bookmarkFromRow(row) : null;
    },
    async set(readerId, itemId, place) {
      const sheet = Math.max(0, Math.trunc(place.sheet) || 0);
      const rawBlock = place.block === null ? null : Math.trunc(place.block);
      const block = rawBlock !== null && Number.isFinite(rawBlock) && rawBlock >= 0 ? rawBlock : null;
      const start = block !== null && place.start ? blockStart(place.start) : null;
      const savedAt = new Date().toISOString();
      await db.query(
        `insert into bookmarks (reader_id, item_id, sheet, block, block_start, saved_at) values ($1, $2, $3, $4, $5, $6)
         on conflict (reader_id, item_id) do update
         set sheet = excluded.sheet, block = excluded.block, block_start = excluded.block_start, saved_at = excluded.saved_at`,
        [readerId, itemId, sheet, block, start, savedAt],
      );
      return { readerId, itemId, sheet, block, start, savedAt };
    },
    async removeItem(itemId) {
      if (!itemId) return;
      await db.query("delete from bookmarks where item_id = $1", [itemId]);
    },
  };
}
