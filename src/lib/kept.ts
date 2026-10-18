/**
 * Kept-piece card display. Author headline when stored.
 * Host is the leaving source, not a headline prefix. Related roll in and out.
 * PROTOCOL §2 / §5 / §10.
 */

import { plainText } from "./article";
import type { RelatedPage } from "./related";
import type { Clip } from "./save";
import type { SourceHeadlineRecord } from "./source-headline";
import type { ContentType, UnderstandingRecord } from "./understanding";

/** Board mark only. Stored contentType stays Comment when Grok wrote Comment. */
export type PaperMark = "News" | "Opinion" | "Study" | "Notice";

const boardMarks: Record<ContentType, PaperMark> = {
  News: "News",
  Comment: "Opinion",
  Study: "Study",
  Notice: "Notice",
};

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function storedHeadline(record: SourceHeadlineRecord | null | undefined) {
  if (record?.status === "ok" && record.text.trim()) return record.text.trim();
  return "";
}

function storedTopic(record: UnderstandingRecord | null | undefined) {
  if (record?.status === "ok" && record.topic.trim()) return record.topic.trim();
  return "";
}

/**
 * Tile heading is the stored source headline when present.
 * Fallback: stored topic. Never a host prefix. Never the raw clip URL. Never invented.
 */
export function keptHeading(clip: Pick<Clip, "url" | "understanding" | "sourceHeadline">): string {
  const headline = storedHeadline(clip.sourceHeadline);
  if (headline) return headline;
  const topic = storedTopic(clip.understanding);
  if (topic) return topic;
  return hostnameOf(clip.url);
}

export function keptSnippet(record: SourceHeadlineRecord | null | undefined) {
  if (!record || record.status === "failed") return "";
  return record.snippet?.trim() ?? "";
}

/** Stored source figure URL only. Never fetched here. Never invented. */
export function keptFigure(record: SourceHeadlineRecord | null | undefined) {
  if (!record || record.status === "failed") return "";
  return record.figure?.trim() ?? "";
}

/**
 * Board label from stored contentType when understanding is ok.
 * Comment → Opinion. Not gated on centralClaim. None if missing or failed.
 */
export function paperBadgeLabel(record: UnderstandingRecord | null | undefined): PaperMark | null {
  if (!record || record.status !== "ok") return null;
  return boardMarks[record.contentType];
}

/** Title, stored snippet, or publisher · date when there is no snippet. Not an off-site link. No invented dek. Tags stripped. */
export function relatedRow(page: RelatedPage) {
  const host = hostnameOf(page.url);
  const snippet = plainText(page.snippet ?? "", 1000);
  const date = typeof page.date === "string" ? page.date.trim() : "";
  return {
    title: plainText(page.title || page.url, 500),
    host,
    snippet,
    detail: snippet ? "" : [host, date].filter(Boolean).join(" · "),
    ...(page.stance ? { stance: page.stance } : {}),
  };
}

/** Selected related join the bind. They stay first in the section. */
export function relatedVisible(pages: RelatedPage[], selected: string[]) {
  return pages.filter((page) => selected.includes(page.url));
}

/** Unselected related stay in the collapsed set. */
export function relatedCollapsed(pages: RelatedPage[], selected: string[]) {
  return pages.filter((page) => !selected.includes(page.url));
}

/** Short count for the section heading. Empty when there is nothing to count. */
export function relatedCountLabel(count: number) {
  return count > 0 ? String(count) : "";
}

/** A Keep still enriching after this long has stopped (restart, cut-off request). */
export const KEEP_STALE_MS = 3 * 60_000;

export type KeepProgress = "reading" | "understanding" | "related" | "stalled";

/** Where a kept card is while it fills in, or null once the related rail landed. */
export function keepProgress(clip: Clip, now = Date.now()): KeepProgress | null {
  if (clip.relatedRail) return null;
  if (now - Date.parse(clip.savedAt) > KEEP_STALE_MS) return "stalled";
  if (!clip.sourceHeadline) return "reading";
  if (!clip.understanding) return "understanding";
  return "related";
}

/** True while some card on the desk is still filling in. */
export function deskEnriching(clips: Clip[], now = Date.now()): boolean {
  return clips.some((clip) => {
    const progress = keepProgress(clip, now);
    return progress !== null && progress !== "stalled";
  });
}
