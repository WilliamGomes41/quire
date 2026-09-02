import { openDb } from "./db";
import type { BoundIssue, BoundPiece, IssueStore } from "./bind";
import { isPublicHttpUrl } from "./article";
import {
  readRelatedRail,
  readRelatedReporting,
  relatedPersist,
  type RelatedRailRecord,
} from "./related";
import type { Clip, ClipStore } from "./save";
import { readSourceHeadline, type SourceHeadlineRecord } from "./source-headline";
import { readTake } from "./take";
import { readUnderstanding, type UnderstandingRecord } from "./understanding";

function clipFromRow(row: Record<string, unknown>): Clip {
  return {
    id: String(row.id),
    url: String(row.url),
    savedAt: new Date(String(row.saved_at)).toISOString(),
    understanding: readUnderstanding(row.understanding),
    relatedRail: readRelatedRail(row.related_rail),
    relatedReporting: readRelatedReporting(row.related_reporting),
    sourceHeadline: readSourceHeadline(row.source_headline),
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
        "select id, url, saved_at, understanding, related_rail, related_reporting, source_headline from clips where id = $1",
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
    async persistSourceHeadline(id: string, record: SourceHeadlineRecord) {
      await db.query("update clips set source_headline = $2 where id = $1", [id, record]);
    },
    async remove(id) {
      if (!id) return;
      await db.query("delete from clips where id = $1", [id]);
    },
  };
}

export async function listClips(): Promise<Clip[]> {
  const db = await openDb();
  const { rows } = await db.query(
    "select id, url, saved_at, understanding, related_rail, related_reporting, source_headline from clips order by saved_at desc",
  );
  return rows.map(clipFromRow);
}

function readPieces(value: unknown): BoundPiece[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    if (typeof rec.url !== "string" || !rec.url) return [];
    if (rec.role !== "original" && rec.role !== "related") return [];
    if (!Array.isArray(rec.paragraphs) || rec.paragraphs.some((p) => typeof p !== "string")) {
      return [];
    }
    const figure =
      typeof rec.figure === "string" && isPublicHttpUrl(rec.figure.trim()) ? rec.figure.trim() : "";
    const coverLine = typeof rec.coverLine === "string" ? rec.coverLine.trim() : "";
    return [
      {
        url: rec.url,
        role: rec.role,
        headline: typeof rec.headline === "string" ? rec.headline : rec.url,
        paragraphs: rec.paragraphs.filter((p): p is string => typeof p === "string" && p.trim() !== ""),
        ...(figure ? { figure } : {}),
        ...(coverLine ? { coverLine } : {}),
      },
    ];
  });
}

function issueFromRow(row: Record<string, unknown>): BoundIssue {
  return {
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    title: String(row.title),
    leadUrl: String(row.lead_url),
    take: readTake(row.take),
    pieces: readPieces(row.pieces),
  };
}

export async function issueStore(): Promise<IssueStore> {
  const db = await openDb();
  return {
    async insert(issue) {
      await db.query(
        "insert into issues (id, created_at, title, lead_url, take, pieces) values ($1, $2, $3, $4, $5, $6)",
        [issue.id, issue.createdAt, issue.title, issue.leadUrl, issue.take, issue.pieces],
      );
      return issue;
    },
    async get(id) {
      const { rows } = await db.query(
        "select id, created_at, title, lead_url, take, pieces from issues where id = $1",
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return issueFromRow(row);
    },
  };
}

export async function listIssues(): Promise<BoundIssue[]> {
  const db = await openDb();
  const { rows } = await db.query(
    "select id, created_at, title, lead_url, take, pieces from issues order by created_at desc",
  );
  return rows.map(issueFromRow);
}
