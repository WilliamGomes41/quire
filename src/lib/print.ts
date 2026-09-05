/**
 * Print this issue — plan and chrome helpers.
 * The compositor itself stays server-side. Not a product named Press.
 */

import type { BoundIssue } from "./bind";
import { composeIssue, type ContentsRow, type SequenceSheet } from "./compose";
import type { DesignIntent } from "./design";

export const paperNames = ["a4", "letter"] as const;
export type PaperName = (typeof paperNames)[number];

export type PrintSheet =
  | {
      kind: "cover";
      masthead: string;
      title: string;
      lead: string;
      meta: string;
      kicker?: string;
    }
  | {
      kind: "contents";
      kicker: string;
      title: string;
      folio: string;
      rows: ContentsRow[];
    }
  | {
      kind: "piece";
      headline: string;
      paragraphs: string[];
      folio: string;
      intent: DesignIntent;
      take?: string;
    };

export type PrintPlan = {
  papers: readonly PaperName[];
  intent: DesignIntent;
  sheets: PrintSheet[];
};

export function paperBox(name: PaperName): [number, number] {
  return name === "letter" ? [612, 792] : [595.28, 841.89];
}

export function paperNameFor(locale = "en-GB"): PaperName {
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  if (region === "US" || region === "CA" || region === "MX" || region === "PH") {
    return "letter";
  }
  return "a4";
}

/** Same bound sequence and Design Intent as Read. */
export function printPlan(issue: BoundIssue): PrintPlan {
  const page = composeIssue(issue);
  return {
    papers: paperNames,
    intent: page.intent,
    sheets: [
      {
        kind: "cover",
        masthead: page.cover.masthead,
        title: page.cover.title,
        lead: page.cover.lead,
        meta: page.cover.meta,
        ...(page.cover.kicker ? { kicker: page.cover.kicker } : {}),
      },
      {
        kind: "contents",
        kicker: page.contents.kicker,
        title: page.contents.title,
        folio: page.contents.folio,
        rows: page.contents.rows,
      },
      ...page.sequence.map((sheet) => piecePlan(sheet)),
    ],
  };
}

function piecePlan(sheet: SequenceSheet): PrintSheet {
  return {
    kind: "piece",
    headline: sheet.headline,
    paragraphs: sheet.paragraphs,
    folio: sheet.folio,
    intent: sheet.intent,
    ...(sheet.take ? { take: sheet.take.text } : {}),
  };
}

export function offerPrint(bytes: string) {
  const raw = Uint8Array.from(atob(bytes), (ch) => ch.charCodeAt(0));
  const blob = new Blob([raw], { type: "application/pdf" });
  const href = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.setAttribute("hidden", "true");
  frame.setAttribute("aria-hidden", "true");
  frame.src = href;
  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(href);
  };
  frame.addEventListener("load", () => {
    const view = frame.contentWindow;
    if (!view) {
      const link = document.createElement("a");
      link.href = href;
      link.download = "issue";
      link.click();
      cleanup();
      return;
    }
    view.focus();
    view.print();
    window.setTimeout(cleanup, 60_000);
  });
  document.body.appendChild(frame);
}
