import { openDb } from "./db";
import type { Clip, ClipStore } from "./save";

export async function clipStore(ownerId: string): Promise<ClipStore> {
  const db = await openDb();
  return {
    async insert(clip) {
      await db.query(
        "insert into clips (id, owner_id, url, saved_at) values ($1, $2, $3, $4)",
        [clip.id, ownerId, clip.url, clip.savedAt],
      );
      return clip;
    },
    async get(id) {
      const { rows } = await db.query(
        "select id, url, saved_at from clips where id = $1 and owner_id = $2",
        [id, ownerId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: String(row.id),
        url: String(row.url),
        savedAt: new Date(String(row.saved_at)).toISOString(),
      };
    },
  };
}

export async function listClips(ownerId: string): Promise<Clip[]> {
  const db = await openDb();
  const { rows } = await db.query(
    "select id, url, saved_at from clips where owner_id = $1 order by saved_at desc",
    [ownerId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    url: String(row.url),
    savedAt: new Date(String(row.saved_at)).toISOString(),
  }));
}
