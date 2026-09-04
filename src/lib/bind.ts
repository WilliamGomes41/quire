/**
 * Bind locks issue contents. Each clipping appears once.
 * Magazine is that bound issue. PROTOCOL §5 / §6.
 */

import { couldNotFetchWords, nothingSelected } from "../copy";
import {
  canonicalizeUrl,
  fetchArticleWords,
  isPublicHttpUrl,
  type ArticleWords,
  type BodyBlock,
  type FigureKind,
} from "./article";
import { chosenFromBoard, type BindChoice, type BoardItem, type ChosenPiece } from "./select";
import type { Clip } from "./save";
import { runGrokTake, takeFail, type TakeRecord } from "./take";

export type BoundPiece = {
  url: string;
  role: "original" | "related";
  headline: string;
  paragraphs: string[];
  figure?: string;
  /** Source-owned cover line already locked on the piece. Never invented. */
  coverLine?: string;
  /** Keep understanding topic. Used to cluster. Never a printed kicker. */
  topic?: string;
  figureCaption?: string;
  figureCredit?: string;
  figureKind?: FigureKind;
  publisher?: string;
  published?: string;
  pullQuotes?: string[];
  subheads?: string[];
  blocks?: BodyBlock[];
  videoUrl?: string;
};

function ownedFromWords(words: ArticleWords): Partial<BoundPiece> {
  return {
    ...(words.figure ? { figure: words.figure } : {}),
    ...(words.figureCaption ? { figureCaption: words.figureCaption } : {}),
    ...(words.figureCredit ? { figureCredit: words.figureCredit } : {}),
    ...(words.figureKind ? { figureKind: words.figureKind } : {}),
    ...(words.publisher ? { publisher: words.publisher } : {}),
    ...(words.published ? { published: words.published } : {}),
    ...(words.pullQuotes?.length ? { pullQuotes: words.pullQuotes } : {}),
    ...(words.subheads?.length ? { subheads: words.subheads } : {}),
    ...(words.blocks?.length ? { blocks: words.blocks } : {}),
    ...(words.videoUrl ? { videoUrl: words.videoUrl } : {}),
  };
}

function clipTopic(clip: Clip) {
  return clip.understanding?.status === "ok" ? clip.understanding.topic.trim() : "";
}

function topicsFromBoard(items: BoardItem[]) {
  const topics = new Map<string, string>();
  for (const item of items) {
    const topic = clipTopic(item.clip);
    if (!topic) continue;
    const keep = canonicalizeUrl(item.clip.url);
    if (keep) topics.set(keep, topic);
    for (const page of item.clip.relatedReporting ?? []) {
      const key = canonicalizeUrl(page.url);
      if (key) topics.set(key, topic);
    }
  }
  return topics;
}

export function readOwnedPieceFields(rec: Record<string, unknown>): Partial<BoundPiece> {
  const text = (value: unknown, max = 400) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
  const figure = typeof rec.figure === "string" && isPublicHttpUrl(rec.figure.trim()) ? rec.figure.trim() : "";
  const coverLine = text(rec.coverLine, 200);
  const topic = text(rec.topic, 180);
  const figureCaption = text(rec.figureCaption, 400);
  const figureCredit = text(rec.figureCredit, 200);
  const figureKind =
    rec.figureKind === "photo" || rec.figureKind === "diagram" || rec.figureKind === "chart"
      ? rec.figureKind
      : undefined;
  const publisher = text(rec.publisher, 120);
  const published = text(rec.published, 40);
  const videoUrl =
    typeof rec.videoUrl === "string" && isPublicHttpUrl(rec.videoUrl.trim()) ? rec.videoUrl.trim() : "";
  const strings = (value: unknown, max = 8) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, max)
      : [];
  const pullQuotes = strings(rec.pullQuotes, 6);
  const subheads = strings(rec.subheads, 12);
  const blocks = Array.isArray(rec.blocks)
    ? rec.blocks.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const block = item as Record<string, unknown>;
        if (
          (block.kind === "paragraph" || block.kind === "subhead" || block.kind === "pullQuote") &&
          typeof block.text === "string" &&
          block.text.trim()
        ) {
          return [{ kind: block.kind, text: block.text.trim() } satisfies BodyBlock];
        }
        return [];
      })
    : [];
  return {
    ...(figure ? { figure } : {}),
    ...(coverLine ? { coverLine } : {}),
    ...(topic ? { topic } : {}),
    ...(figureCaption ? { figureCaption } : {}),
    ...(figureCredit ? { figureCredit } : {}),
    ...(figureKind ? { figureKind } : {}),
    ...(publisher ? { publisher } : {}),
    ...(published ? { published } : {}),
    ...(pullQuotes.length ? { pullQuotes } : {}),
    ...(subheads.length ? { subheads } : {}),
    ...(blocks.length ? { blocks } : {}),
    ...(videoUrl ? { videoUrl } : {}),
  };
}

export type BoundIssue = {
  id: string;
  createdAt: string;
  title: string;
  leadUrl: string;
  take: TakeRecord | null;
  pieces: BoundPiece[];
};

export type IssueStore = {
  insert: (issue: BoundIssue) => Promise<BoundIssue>;
  get: (id: string) => Promise<BoundIssue | null>;
  remove: (id: string) => Promise<void>;
};

export type CreateIssueOptions = {
  fetchWords?: (url: string) => Promise<ArticleWords>;
  writeTake?: (words: ArticleWords) => Promise<string>;
};

function newId() {
  return crypto.randomUUID();
}

export function leadPiece(pieces: BoundPiece[]) {
  return pieces.find((piece) => piece.role === "original") ?? pieces[0] ?? null;
}

/**
 * Read this keep on the magazine sheet. Not a bind. Not /clips.
 * Related still join only when selected at Create issue.
 */
export function issueFromKeptWords(clip: Clip, words: ArticleWords): BoundIssue {
  return {
    id: clip.id,
    createdAt: clip.savedAt,
    title: words.headline,
    leadUrl: clip.url,
    take: null,
    pieces: [
      {
        url: clip.url,
        role: "original",
        headline: words.headline,
        paragraphs: words.paragraphs,
        ...ownedFromWords(words),
        ...(clipTopic(clip) ? { topic: clipTopic(clip) } : {}),
      },
    ],
  };
}

async function wordsFor(
  chosen: ChosenPiece,
  fetchWords: (url: string) => Promise<ArticleWords>,
): Promise<BoundPiece | null> {
  try {
    const words = await fetchWords(chosen.url);
    if (words.paragraphs.length === 0) return null;
    return {
      url: chosen.url,
      role: chosen.role,
      headline: words.headline,
      paragraphs: words.paragraphs,
      ...ownedFromWords(words),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch and lock the chosen pieces. Original words stay the author's.
 * Take is optional after Select. Take failure does not fail the issue.
 */
export async function createIssue(
  input: { clip: Clip; choice?: Partial<BindChoice> | null } | { items: BoardItem[] },
  issues: IssueStore,
  options?: CreateIssueOptions,
): Promise<BoundIssue> {
  const items: BoardItem[] = "items" in input ? input.items : [{ clip: input.clip, choice: input.choice }];
  const chosen = chosenFromBoard(items);
  if (chosen.length === 0) {
    throw new Error(nothingSelected);
  }

  const fetchWords = options?.fetchWords ?? fetchArticleWords;
  const fetched = await Promise.all(chosen.map((piece) => wordsFor(piece, fetchWords)));
  const pieces = fetched.filter((piece): piece is BoundPiece => piece !== null);
  const topics = topicsFromBoard(items);

  const seen = new Set<string>();
  const locked: BoundPiece[] = [];
  for (const piece of pieces) {
    if (seen.has(piece.url)) continue;
    seen.add(piece.url);
    const topic = topics.get(canonicalizeUrl(piece.url));
    locked.push(topic ? { ...piece, topic } : piece);
  }

  const lead = leadPiece(locked);
  if (!lead || lead.paragraphs.length === 0) {
    throw new Error(couldNotFetchWords);
  }

  let take: TakeRecord | null = null;
  const writeTake = options?.writeTake ?? runGrokTake;
  try {
    const text = await writeTake({
      url: lead.url,
      headline: lead.headline,
      paragraphs: lead.paragraphs,
    });
    take = { status: "ok", text };
  } catch (error) {
    take = takeFail(error);
  }

  return issues.insert({
    id: newId(),
    createdAt: new Date().toISOString(),
    title: lead.headline,
    leadUrl: lead.url,
    take,
    pieces: locked,
  });
}
