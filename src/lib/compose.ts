/**
 * Page composition for Read. Magazine is the bound issue.
 * Composition changes for calm reading. Not a Desk restyle. PROTOCOL §6.
 * Plan is derived at read time — bound content does not store geometry.
 */

import type { BoundIssue, BoundPiece } from "./bind";
import { leadPiece } from "./bind";
import { designIntent, type DesignIntent } from "./design";
import { takeText } from "./take";

export type PageLead = {
  headline: string;
  paragraphs: string[];
  url: string;
};

export type PagePlan = {
  title: string;
  intent: DesignIntent;
  opener: { title: string; source: string };
  take?: { text: string };
  lead: PageLead;
  secondary: PageLead[];
};

export function composeIssue(issue: BoundIssue): PagePlan {
  const lead = leadPiece(issue.pieces);
  if (!lead || lead.paragraphs.length === 0) {
    throw new Error("A bound issue needs the author's words.");
  }

  const take = takeText(issue.take);
  const secondary = issue.pieces
    .filter((piece) => piece.url !== lead.url)
    .map(asLead);

  return {
    title: issue.title || lead.headline,
    intent: designIntent({
      hasTake: Boolean(take),
      hasSecondary: secondary.length > 0,
    }),
    opener: {
      title: issue.title || lead.headline,
      source: lead.url,
    },
    ...(take ? { take: { text: take } } : {}),
    lead: asLead(lead),
    secondary,
  };
}

function asLead(piece: BoundPiece): PageLead {
  return {
    headline: piece.headline,
    paragraphs: piece.paragraphs,
    url: piece.url,
  };
}
