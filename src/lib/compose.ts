/**
 * Page composition for Read. Magazine is the bound issue as a sheet.
 * Cover / contents / sequence. Not opener + paragraph column + Take aside.
 * Original words stay the author's. Plan is derived at read time. PROTOCOL §6.
 */

import { contentsKicker, kicker, productName } from "../copy";
import type { BoundIssue, BoundPiece } from "./bind";
import { leadPiece } from "./bind";
import { designIntent, type DesignIntent } from "./design";
import { takeText } from "./take";

export type FigureFit = DesignIntent["figure_fit"];

export type SheetFigure = {
  url: string;
  fit: FigureFit;
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
};

export type PagePlan = {
  title: string;
  intent: DesignIntent;
  take?: { text: string };
  lead: PageLead;
  secondary: PageLead[];
  cover: {
    masthead: string;
    kicker: string;
    title: string;
    lead: string;
    meta: string;
    figure?: SheetFigure;
  };
  contents: {
    kicker: string;
    title: string;
    rows: { title: string; folio: string }[];
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

function asFigure(url: string | undefined, fit: FigureFit): SheetFigure | undefined {
  if (!url) return undefined;
  return { url, fit };
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
  const secondaryPieces = issue.pieces.filter((piece) => piece.url !== lead.url);
  const secondary = secondaryPieces.map(asLead);
  const hasSecondary = secondary.length > 0;
  const leadIntent = designIntent({
    hasTake: Boolean(take),
    hasSecondary,
    hasFigure: Boolean(lead.figure),
    role: "original",
    chars: charsOf(lead.paragraphs),
    index: 0,
  });

  const sequence: SequenceSheet[] = issue.pieces.map((piece, index) => {
    const isLead = piece.url === lead.url;
    const intent = isLead
      ? leadIntent
      : designIntent({
          hasTake: false,
          hasSecondary,
          hasFigure: Boolean(piece.figure),
          role: piece.role,
          chars: charsOf(piece.paragraphs),
          index,
        });
    const figure = asFigure(piece.figure, intent.figure_fit);
    return {
      headline: piece.headline,
      paragraphs: piece.paragraphs,
      intent,
      folio: folioOf(index + 3),
      ...(figure ? { figure } : {}),
      ...(isLead && take ? { take: { text: take } } : {}),
    };
  });

  const title = issue.title || lead.headline;
  const coverFigure = asFigure(lead.figure, leadIntent.figure_fit);

  return {
    title,
    intent: leadIntent,
    ...(take ? { take: { text: take } } : {}),
    lead: asLead(lead),
    secondary,
    cover: {
      masthead: productName,
      kicker,
      title,
      lead: lead.headline,
      meta: boundMeta(issue.createdAt),
      ...(coverFigure ? { figure: coverFigure } : {}),
    },
    contents: {
      kicker: contentsKicker,
      title: "Contents",
      rows: sequence.map((sheet) => ({ title: sheet.headline, folio: sheet.folio })),
    },
    sequence,
  };
}
