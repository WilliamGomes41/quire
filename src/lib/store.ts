import { openDb } from "./db";
import {
  readRelatedRail,
  readRelatedReporting,
  relatedPersist,
  type RelatedRailRecord,
} from "./related";
import type { Clip, ClipStore } from "./save";
import { readUnderstanding, type UnderstandingRecord } from "./understanding";

function clipFromRow(row: Record<string, unknown>): Clip {
  return {
    id: String(row.id),
    url: String(row.url),
    savedAt: new Date(String(row.saved_at)).toISOString(),
    understanding: readUnderstanding(row.understanding),
    relatedRail: readRelatedRail(row.related_rail),
    relatedReporting: readRelatedReporting(row.related_reporting),
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
        "select id, url, saved_at, understanding, related_rail, related_reporting from clips where id = $1",
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return clipFromRow(row);
    },
    async persistUnderstanding(id: string, record: UnderstandingRecord) {
      await db.query("update clips set understanding = $2 where id = $1", [id, record]);
    },
    async persistRelated(id: string, record: RelatedRailRecord) {
      const write = relatedPersist(record);
      if ("related_reporting" in write) {
        await db.query(
          "update clips set related_rail = $2, related_reporting = $3 where id = $1",
          [id, write.related_rail, write.related_reporting],
        );
        return;
      }
      await db.query("update clips set related_rail = $2 where id = $1", [id, write.related_rail]);
    },
  };
}

export async function listClips(): Promise<Clip[]> {
  const db = await openDb();
  const { rows } = await db.query(
    "select id, url, saved_at, understanding, related_rail, related_reporting from clips order by saved_at desc",
  );
  return rows.map(clipFromRow);
}
