/**
 * Page composition for Read. Magazine is the bound issue as a sheet.
 * Cover / contents / sequence. Not opener + paragraph column + Take aside.
 * Original words stay the author's. Plan is derived at read time. PROTOCOL §6.
 */

import { contentsAbsentCopy, contentsKicker, productName, stanceCopy } from "../copy";
import type { BodyBlock, FigureKind } from "./article";
import type { BoundIssue, BoundPiece } from "./bind";
import { leadPiece } from "./bind";
import { designIntent, figureFitFor, type DesignIntent } from "./design";
import { isRelatedStance, type RelatedStance } from "./related";
import { slotState } from "./related-stance";
import { takeText } from "./take";

export type FigureFit = DesignIntent["figure_fit"];

export type SheetFigure = {
  url: string;
  fit: FigureFit;
  caption?: string;
  credit?: string;
  kind?: FigureKind;
};

export type PageLead = {
  headline: string;
  paragraphs: string[];
  url: string;
  figure?: string;
};

export type SequenceSheet = {
  headline: string;
  paragraphs: string[];
  intent: DesignIntent;
  folio: string;
  figure?: SheetFigure;
  take?: { text: string };
  blocks?: BodyBlock[];
  pullQuotes?: string[];
  colophon?: string;
  videoUrl?: string;
};

export type ContentsRow = {
  title: string;
  folio: string;
  absent?: boolean;
  stance?: RelatedStance;
};

export type PagePlan = {
  title: string;
  intent: DesignIntent;
  take?: { text: string };
  lead: PageLead;
  secondary: PageLead[];
  cover: {
    masthead: string;
    kicker?: string;
    title: string;
    lead: string;
    meta: string;
    figure?: SheetFigure;
  };
  contents: {
    kicker: string;
    title: string;
    folio: string;
    rows: ContentsRow[];
  };
  sequence: SequenceSheet[];
};

function charsOf(paragraphs: string[]) {
  return paragraphs.join(" ").length;
}

function folioOf(page: number) {
  return String(page).padStart(2, "0");
}

function boundMeta(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function asFigure(piece: BoundPiece, fit: FigureFit): SheetFigure | undefined {
  if (!piece.figure) return undefined;
  const kind = piece.figureKind;
  return {
    url: piece.figure,
    fit: figureFitFor(kind, fit),
    ...(piece.figureCaption ? { caption: piece.figureCaption } : {}),
    ...(piece.figureCredit ? { credit: piece.figureCredit } : {}),
    ...(kind ? { kind } : {}),
  };
}

function hostTokens(url: string) {
  try {
    return new URL(url).hostname
      .replace(/^www\./i, "")
      .toLowerCase()
      .split(".")
      .filter((part) => part.length > 2);
  } catch {
    return [];
  }
}

function topicTokens(piece: BoundPiece) {
  const noise = new Set(hostTokens(piece.url));
  return new Set(
    [piece.topic, piece.headline, piece.paragraphs[0] ?? ""]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 2 && !noise.has(token)),
  );
}

function topicOverlap(a: BoundPiece, b: BoundPiece) {
  const left = topicTokens(a);
  const right = topicTokens(b);
  let n = 0;
  for (const token of left) if (right.has(token)) n += 1;
  return n;
}

function topicCluster(lead: BoundPiece, rest: BoundPiece[]): BoundPiece[] {
  const topicOf = (piece: BoundPiece) => (piece.topic ?? "").trim().toLowerCase();
  const groups = new Map<string, BoundPiece[]>();
  const unkeyed: BoundPiece[] = [];
  for (const piece of rest) {
    const key = topicOf(piece);
    if (!key) {
      unkeyed.push(piece);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(piece);
    groups.set(key, list);
  }

  const ordered: BoundPiece[] = [];
  const leadKey = topicOf(lead);
  if (leadKey && groups.has(leadKey)) {
    ordered.push(...(groups.get(leadKey) ?? []));
    groups.delete(leadKey);
  }
  for (const list of groups.values()) {
    ordered.push(...list);
  }
  ordered.push(
    ...unkeyed
      .map((piece) => ({ piece, score: topicOverlap(lead, piece) }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.piece),
  );
  return ordered;
}

function stanceBucket(piece: BoundPiece): "comparable" | "contrarian" | "inconclusive" | "unlabeled" {
  if (piece.stance === "comparable") return "comparable";
  if (piece.stance === "contrarian") return "contrarian";
  if (piece.stance === "inconclusive") return "inconclusive";
  return "unlabeled";
}

/** Lead first. Related cluster by topic, never by hostname. When any stance: original → comparable → contrarian → inconclusive → unlabeled; topic cluster within. */
export function clusterPieces(pieces: BoundPiece[]): BoundPiece[] {
  const lead = leadPiece(pieces);
  if (!lead) return pieces;
  const rest = pieces.filter((piece) => piece.url !== lead.url);
  if (rest.length === 0) return [lead];

  if (!rest.some((piece) => piece.stance)) {
    return [lead, ...topicCluster(lead, rest)];
  }

  const buckets = {
    comparable: [] as BoundPiece[],
    contrarian: [] as BoundPiece[],
    inconclusive: [] as BoundPiece[],
    unlabeled: [] as BoundPiece[],
  };
  for (const piece of rest) {
    buckets[stanceBucket(piece)].push(piece);
  }
  return [
    lead,
    ...topicCluster(lead, buckets.comparable),
    ...topicCluster(lead, buckets.contrarian),
    ...topicCluster(lead, buckets.inconclusive),
    ...topicCluster(lead, buckets.unlabeled),
  ];
}

function quietDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  return trimmed;
}

/** Quiet publisher · date. Source-owned only. Never a hostname fallback. Related stance sits here when labeled. */
export function pieceColophon(piece: BoundPiece) {
  const publisher = piece.publisher?.trim() ?? "";
  const date = piece.published ? quietDate(piece.published) : "";
  const stance = piece.role === "related" && piece.stance ? stanceCopy(piece.stance) : "";
  return [publisher, date, stance].filter(Boolean).join(" · ");
}

/**
 * Cover kicker only when bind already locked a source-owned line.
 * Product copy.kicker, understanding.topic, take, and an invented dek are not substitutes.
 */
export function sourceOwnedCoverLine(issue: BoundIssue): string | undefined {
  const line = leadPiece(issue.pieces)?.coverLine?.trim();
  return line || undefined;
}

function contentsRows(pieces: BoundPiece[], sequence: SequenceSheet[]): ContentsRow[] {
  const rows: ContentsRow[] = sequence.map((sheet, index) => {
    const piece = pieces[index];
    const stance = piece?.role === "related" && isRelatedStance(piece.stance) ? piece.stance : undefined;
    return {
      title: sheet.headline,
      folio: sheet.folio,
      ...(stance ? { stance } : {}),
    };
  });
  const related = pieces.filter((piece) => piece.role === "related");
  if (related.length === 0) return rows;
  if (slotState(related, "comparable") === "absent") {
    rows.push({ title: contentsAbsentCopy("comparable"), folio: "", absent: true });
  }
  if (slotState(related, "contrarian") === "absent") {
    rows.push({ title: contentsAbsentCopy("contrarian"), folio: "", absent: true });
  }
  return rows;
}

function asLead(piece: BoundPiece): PageLead {
  return {
    headline: piece.headline,
    paragraphs: piece.paragraphs,
    url: piece.url,
    ...(piece.figure ? { figure: piece.figure } : {}),
  };
}

export function composeIssue(issue: BoundIssue): PagePlan {
  const lead = leadPiece(issue.pieces);
  if (!lead || lead.paragraphs.length === 0) {
    throw new Error("A bound issue needs the author's words.");
  }

  const take = takeText(issue.take);
  const clustered = clusterPieces(issue.pieces);
  const secondaryPieces = clustered.filter((piece) => piece.url !== lead.url);
  const secondary = secondaryPieces.map(asLead);
  const hasSecondary = secondary.length > 0;
  const leadIntent = designIntent({
    hasTake: Boolean(take),
    hasSecondary,
    hasFigure: Boolean(lead.figure),
    role: "original",
    chars: charsOf(lead.paragraphs),
    index: 0,
    isVideo: Boolean(lead.videoUrl),
    figureKind: lead.figureKind,
    hasPullQuote: Boolean(lead.pullQuotes?.length),
  });

  const sequence: SequenceSheet[] = clustered.map((piece, index) => {
    const isLead = piece.url === lead.url;
    const intent = isLead
      ? leadIntent
      : designIntent({
          hasTake: false,
          hasSecondary,
          hasFigure: Boolean(piece.figure),
          role: "related",
          chars: charsOf(piece.paragraphs),
          index,
          isVideo: Boolean(piece.videoUrl),
          figureKind: piece.figureKind,
          hasPullQuote: Boolean(piece.pullQuotes?.length),
        });
    const figure = asFigure(piece, intent.figure_fit);
    const colophon = pieceColophon(piece);
    const briefing =
      intent.treatment === "screening" ? piece.paragraphs.slice(0, 2) : piece.paragraphs;
    return {
      headline: piece.headline,
      paragraphs: briefing,
      intent,
      folio: folioOf(index + 3),
      ...(figure ? { figure } : {}),
      ...(isLead && take ? { take: { text: take } } : {}),
      ...(piece.blocks?.length && intent.treatment !== "screening" ? { blocks: piece.blocks } : {}),
      ...(piece.pullQuotes?.length ? { pullQuotes: piece.pullQuotes } : {}),
      ...(colophon ? { colophon } : {}),
      ...(piece.videoUrl ? { videoUrl: piece.videoUrl } : {}),
    };
  });

  const title = issue.title || lead.headline;
  const coverFigure = asFigure(lead, leadIntent.figure_fit);
  const coverKicker = sourceOwnedCoverLine(issue);

  return {
    title,
    intent: leadIntent,
    ...(take ? { take: { text: take } } : {}),
    lead: asLead(lead),
    secondary,
    cover: {
      masthead: productName,
      title,
      lead: lead.headline,
      meta: boundMeta(issue.createdAt),
      ...(coverKicker ? { kicker: coverKicker } : {}),
      ...(coverFigure ? { figure: coverFigure } : {}),
    },
    contents: {
      kicker: contentsKicker,
      title: "Contents",
      folio: folioOf(2),
      rows: contentsRows(clustered, sequence),
    },
    sequence,
  };
}

export type ReadingSheet =
  | { kind: "cover" }
  | { kind: "contents" }
  | { kind: "piece"; index: number };

/** Cover, then contents, then the sequence. One sheet at a time. Not a stacked page. */
export function readingSheets(page: PagePlan): ReadingSheet[] {
  return [
    { kind: "cover" },
    { kind: "contents" },
    ...page.sequence.map((_, index) => ({ kind: "piece" as const, index })),
  ];
}

/** Same object: cover 0, contents 1, pieces after that. */
export function pieceSheetIndex(pieceIndex: number): number {
  return 2 + pieceIndex;
}

export function clampSheetIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

export function nextSheetIndex(index: number, count: number): number {
  return clampSheetIndex(index + 1, count);
}

export function previousSheetIndex(index: number, count: number): number {
  return clampSheetIndex(index - 1, count);
}
