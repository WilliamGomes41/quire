/**
 * Internal compositor for Print this issue. Same bound plan as Read.
 * A4 or letter. Not a product named Press. PROTOCOL §6 / §7.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkitMod from "@pdf-lib/fontkit";
import {
  PageSizes,
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import type { BoundIssue } from "./bind";
import { composeIssue, type PagePlan, type SequenceSheet } from "./compose";
import type { DesignIntent } from "./design";

export const paperNames = ["a4", "letter"] as const;
export type PaperName = (typeof paperNames)[number];

const PAPER = rgb(243 / 255, 238 / 255, 228 / 255);
const INK = rgb(28 / 255, 24 / 255, 20 / 255);
const BINDING = rgb(61 / 255, 74 / 255, 58 / 255);
const MUTED = rgb(110 / 255, 101 / 255, 92 / 255);
const RULE = rgb(212 / 255, 201 / 255, 184 / 255);

const FACES = {
  sans: new URL("../../fonts/SourceSans3-Regular.ttf", import.meta.url),
  sansMed: new URL("../../fonts/SourceSans3-Semibold.ttf", import.meta.url),
  serif: new URL("../../fonts/SourceSerif4-Regular.ttf", import.meta.url),
  serifIt: new URL("../../fonts/SourceSerif4-Italic.ttf", import.meta.url),
} as const;

type Faces = {
  sans: PDFFont;
  sansMed: PDFFont;
  serif: PDFFont;
  serifIt: PDFFont;
};

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
      rows: { title: string; folio: string }[];
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
  return name === "letter" ? PageSizes.Letter : PageSizes.A4;
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

export async function composePrint(issue: BoundIssue, paper: PaperName = "a4"): Promise<Uint8Array> {
  const page = composeIssue(issue);
  const plan = printPlan(issue);
  const doc = await PDFDocument.create();
  doc.registerFontkit(resolveFontkit() as Parameters<PDFDocument["registerFontkit"]>[0]);
  const faces = await embedFaces(doc);
  const book = openBook(doc, faces, paper);

  for (const sheet of plan.sheets) {
    if (sheet.kind === "cover") {
      drawCover(book, sheet);
      continue;
    }
    if (sheet.kind === "contents") {
      drawContents(book, sheet);
      continue;
    }
    await drawPiece(book, sheet, page);
  }

  return doc.save();
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

function resolveFontkit() {
  const raw = fontkitMod as { create?: unknown; default?: { create?: unknown } };
  if (raw && typeof raw.create === "function") return raw;
  if (raw.default && typeof raw.default.create === "function") return raw.default;
  throw new Error("fontkit has no create()");
}

async function embedFaces(doc: PDFDocument): Promise<Faces> {
  const [sans, sansMed, serif, serifIt] = await Promise.all([
    doc.embedFont(faceBytes(FACES.sans), { subset: true }),
    doc.embedFont(faceBytes(FACES.sansMed), { subset: true }),
    doc.embedFont(faceBytes(FACES.serif), { subset: true }),
    doc.embedFont(faceBytes(FACES.serifIt), { subset: true }),
  ]);
  return { sans, sansMed, serif, serifIt };
}

function faceBytes(face: URL) {
  try {
    return readFileSync(fileURLToPath(face));
  } catch {
    return readFileSync(join(process.cwd(), "fonts", face.pathname.split("/").pop() ?? ""));
  }
}

type Book = {
  doc: PDFDocument;
  faces: Faces;
  size: [number, number];
  page: PDFPage;
  y: number;
  left: number;
  width: number;
};

function openBook(doc: PDFDocument, faces: Faces, paper: PaperName): Book {
  const size = paperBox(paper);
  const left = 54;
  const book: Book = {
    doc,
    faces,
    size,
    page: doc.addPage(size),
    y: size[1] - 54,
    left,
    width: size[0] - 108,
  };
  fillPaper(book.page, size);
  return book;
}

function fillPaper(page: PDFPage, size: [number, number]) {
  page.drawRectangle({ x: 0, y: 0, width: size[0], height: size[1], color: PAPER });
}

function freshPage(book: Book, folio?: string) {
  book.page = book.doc.addPage(book.size);
  fillPaper(book.page, book.size);
  book.y = book.size[1] - 54;
  if (folio) drawRunning(book, folio);
}

function need(book: Book, height: number, folio?: string) {
  if (book.y - height < 54) freshPage(book, folio);
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (font.widthOfTextAtSize(trial, size) <= width) {
        chunk = trial;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

function write(
  book: Book,
  text: string,
  font: PDFFont,
  size: number,
  leading: number,
  color = INK,
  width = book.width,
) {
  for (const line of wrap(font, text, size, width)) {
    need(book, leading);
    book.page.drawText(line, {
      x: book.left,
      y: book.y - size,
      size,
      font,
      color,
    });
    book.y -= leading;
  }
}

function rule(book: Book, color = RULE) {
  need(book, 10);
  book.page.drawRectangle({
    x: book.left,
    y: book.y,
    width: 72,
    height: 1.5,
    color,
  });
  book.y -= 16;
}

function hairline(book: Book) {
  need(book, 8);
  book.page.drawRectangle({
    x: book.left,
    y: book.y,
    width: book.width,
    height: 1,
    color: INK,
  });
  book.y -= 10;
}

function drawRunning(book: Book, folio: string) {
  book.page.drawText("Quire", {
    x: book.left,
    y: book.size[1] - 40,
    size: 8,
    font: book.faces.sans,
    color: MUTED,
  });
  const label = folio;
  book.page.drawText(label, {
    x: book.left + book.width - book.faces.sans.widthOfTextAtSize(label, 8),
    y: book.size[1] - 40,
    size: 8,
    font: book.faces.sans,
    color: MUTED,
  });
  book.page.drawRectangle({
    x: book.left,
    y: book.size[1] - 48,
    width: book.width,
    height: 0.6,
    color: RULE,
  });
  book.y = book.size[1] - 68;
}

function drawCover(book: Book, sheet: Extract<PrintSheet, { kind: "cover" }>) {
  if (sheet.kicker) {
    write(book, sheet.kicker.toUpperCase(), book.faces.sansMed, 9, 14, BINDING);
  }
  write(book, sheet.masthead, book.faces.serif, 42, 40);
  rule(book, BINDING);
  write(book, sheet.title, book.faces.serif, 28, 32);
  if (sheet.lead) {
    book.y -= 8;
    write(book, sheet.lead.toUpperCase(), book.faces.sans, 9, 14, INK);
  }
  if (sheet.meta) {
    book.y -= 16;
    write(book, sheet.meta.toUpperCase(), book.faces.sans, 8, 12, MUTED);
  }
}

function drawContents(book: Book, sheet: Extract<PrintSheet, { kind: "contents" }>) {
  freshPage(book, sheet.folio);
  write(book, sheet.kicker.toUpperCase(), book.faces.sansMed, 9, 14, BINDING);
  write(book, sheet.title, book.faces.serif, 36, 40);
  book.y -= 8;
  for (const row of sheet.rows) {
    need(book, 28, sheet.folio);
    book.page.drawText(row.title, {
      x: book.left,
      y: book.y - 13,
      size: 13,
      font: book.faces.serif,
      color: INK,
    });
    book.page.drawText(row.folio, {
      x: book.left + book.width - book.faces.sans.widthOfTextAtSize(row.folio, 9),
      y: book.y - 12,
      size: 9,
      font: book.faces.sans,
      color: MUTED,
    });
    book.page.drawRectangle({
      x: book.left,
      y: book.y - 20,
      width: book.width,
      height: 0.6,
      color: RULE,
    });
    book.y -= 28;
  }
}

async function drawPiece(book: Book, sheet: Extract<PrintSheet, { kind: "piece" }>, page: PagePlan) {
  freshPage(book, sheet.folio);
  const figure = page.sequence.find((item) => item.folio === sheet.folio)?.figure;
  if (sheet.intent.composition === "visual-opener" && figure) {
    await drawFigure(book, figure.url, sheet.folio);
  }
  write(book, sheet.headline, book.faces.serif, 26, 30);
  if (sheet.intent.composition !== "visual-opener" && figure) {
    await drawFigure(book, figure.url, sheet.folio);
  }
  if (sheet.take) {
    book.y -= 6;
    hairline(book);
    write(book, sheet.take, book.faces.serifIt, 12, 18);
    hairline(book);
  }
  const columns = sheet.intent.body_flow === "two" ? 2 : 1;
  const gutter = 18;
  const colWidth = columns === 2 ? (book.width - gutter) / 2 : book.width;
  if (columns === 1) {
    for (const paragraph of sheet.paragraphs) {
      book.y -= 4;
      write(book, paragraph, book.faces.serif, 11, 16);
    }
    return;
  }
  const lines = sheet.paragraphs.flatMap((paragraph, index) => [
    ...(index > 0 ? [""] : []),
    ...wrap(book.faces.serif, paragraph, 11, colWidth),
  ]);
  const leading = 16;
  let col = 0;
  let y = book.y;
  const top = book.y;
  for (const line of lines) {
    if (y - leading < 54) {
      col += 1;
      if (col >= 2) {
        freshPage(book, sheet.folio);
        col = 0;
        y = book.y;
      } else {
        y = top;
      }
    }
    if (line) {
      book.page.drawText(line, {
        x: book.left + col * (colWidth + gutter),
        y: y - 11,
        size: 11,
        font: book.faces.serif,
        color: INK,
      });
    }
    y -= leading;
  }
  book.y = y;
}

async function drawFigure(book: Book, url: string, folio: string) {
  const image = await tryEmbed(book.doc, url);
  if (!image) return;
  const maxH = 180;
  const scale = Math.min(book.width / image.width, maxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  need(book, h + 16, folio);
  book.page.drawImage(image, {
    x: book.left,
    y: book.y - h,
    width: w,
    height: h,
  });
  book.y -= h + 16;
}

async function tryEmbed(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const kind = response.headers.get("content-type") ?? "";
    if (kind.includes("png") || bytes[0] === 0x89) return doc.embedPng(bytes);
    return doc.embedJpg(bytes);
  } catch {
    return null;
  }
}
