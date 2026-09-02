/**
 * Kept-piece card display. Author headline when stored.
 * Host and topic stay secondary. Related rows stay checkboxes.
 * PROTOCOL §2 / §5 / §10.
 */

import type { RelatedPage } from "./related";
import type { Clip } from "./save";
import type { SourceHeadlineRecord } from "./source-headline";
import type { ContentType, UnderstandingRecord } from "./understanding";

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
 * Fallback: host + stored topic. Never the raw clip URL. Never invented.
 */
export function keptHeading(clip: Pick<Clip, "url" | "understanding" | "sourceHeadline">): string {
  const headline = storedHeadline(clip.sourceHeadline);
  if (headline) return headline;
  const host = hostnameOf(clip.url);
  const topic = storedTopic(clip.understanding);
  if (host && topic) return `${host} · ${topic}`;
  if (topic) return topic;
  return host;
}

export function keptSnippet(record: SourceHeadlineRecord | null | undefined) {
  if (!record || record.status === "failed") return "";
  return record.snippet?.trim() ?? "";
}

/** Paper badge from stored understanding when status is ok. No badge if missing or failed. */
export function paperBadgeLabel(record: UnderstandingRecord | null | undefined): ContentType | null {
  if (!record || record.status !== "ok") return null;
  return record.contentType;
}

/** Title, stored snippet, or publisher when there is no snippet. Not an off-site link. */
export function relatedRow(page: RelatedPage) {
  const host = hostnameOf(page.url);
  const snippet = page.snippet ?? "";
  return {
    title: page.title || page.url,
    host,
    snippet,
    detail: snippet ? "" : host,
  };
}
