/**
 * Kept-piece card display. Host and topic as heading. Source is not the title.
 * Related rows stay checkboxes; snippet/host are already stored.
 * PROTOCOL §2 / §5 / §10.
 */

import type { RelatedPage } from "./related";
import type { ContentType, UnderstandingRecord } from "./understanding";

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/** Host, plus topic when the stored understanding is ok. Never the raw clip URL. */
export function keptHeading(clip: { url: string; understanding: UnderstandingRecord | null }): string {
  if (clip.understanding?.status === "ok") {
    const topic = clip.understanding.topic.trim();
    if (topic) return topic;
  }
  return hostnameOf(clip.url) || clip.url.replace(/^https?:\/\//i, "");
}

/** Paper badge from stored understanding when status is ok. No badge if missing or failed. */
export function paperBadgeLabel(record: UnderstandingRecord | null | undefined): ContentType | null {
  if (!record || record.status !== "ok") return null;
  return record.contentType;
}

/** Title, host, and stored snippet for a Select related row. Not an off-site link. */
export function relatedRow(page: RelatedPage) {
  return {
    title: page.title || page.url,
    host: hostnameOf(page.url),
    snippet: page.snippet ?? "",
  };
}
