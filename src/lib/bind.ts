/**
 * Bind locks issue contents. Each clipping appears once.
 * Magazine is that bound issue. PROTOCOL §5 / §6.
 */

import { couldNotFetchWords, nothingSelected } from "../copy";
import { fetchArticleWords, type ArticleWords } from "./article";
import { chosenFromBoard, type BindChoice, type BoardItem, type ChosenPiece } from "./select";
import type { Clip } from "./save";
import { runGrokTake, takeFail, type TakeRecord } from "./take";

export type BoundPiece = {
  url: string;
  role: "original" | "related";
  headline: string;
  paragraphs: string[];
};

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

  const seen = new Set<string>();
  const locked: BoundPiece[] = [];
  for (const piece of pieces) {
    if (seen.has(piece.url)) continue;
    seen.add(piece.url);
    locked.push(piece);
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
