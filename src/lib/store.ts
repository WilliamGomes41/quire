import { openDb } from "./db";
import type { Clip, ClipStore } from "./save";
import { readUnderstanding, type UnderstandingRecord } from "./understanding";

function clipFromRow(row: Record<string, unknown>): Clip {
  return {
    id: String(row.id),
    url: String(row.url),
    savedAt: new Date(String(row.saved_at)).toISOString(),
    understanding: readUnderstanding(row.understanding),
  };
}

export async function clipStore(): Promise<ClipStore> {
  const db = await openDb();
  return {
    async insert(clip) {
      await db.query("insert into clips (id, url, saved_at) values ($1, $2, $3)", [
        clip.id,
        clip.url,
        clip.savedAt,
      ]);
      return clip;
    },
    async get(id) {
      const { rows } = await db.query(
        "select id, url, saved_at, understanding from clips where id = $1",
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return clipFromRow(row);
    },
    async persistUnderstanding(id: string, record: UnderstandingRecord) {
      await db.query("update clips set understanding = $2 where id = $1", [id, record]);
    },
  };
}

export async function listClips(): Promise<Clip[]> {
  const db = await openDb();
  const { rows } = await db.query(
    "select id, url, saved_at, understanding from clips order by saved_at desc",
  );
  return rows.map(clipFromRow);
}
