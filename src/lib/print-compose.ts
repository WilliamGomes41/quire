/**
 * Server compositor for Print this issue. Same bound plan as Read.
 * A4 or letter. Embedded Source faces. Not a product named Press.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fontkitMod from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { stanceCopy } from "../copy";
import type { BoundIssue } from "./bind";
import { composeIssue, type PagePlan } from "./compose";
import { paperBox, printPlan, type PaperName, type PrintSheet } from "./print";
import { qrMatrix } from "./qr";

const PAPER = rgb(250 / 255, 247 / 255, 241 / 255);
const INK = rgb(28 / 255, 24 / 255, 20 / 255);
const BINDING = rgb(74 / 255, 92 / 255, 86 / 255);
const MUTED = rgb(121 / 255, 118 / 255, 113 / 255);
const QUIET = rgb(157 / 255, 153 / 255, 148 / 255);
const RULE = rgb(214 / 255, 211 / 255, 206 / 255);

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
    const label = !row.absent && row.stance ? stanceCopy(row.stance) : "";
    const stanceWidth = label ? book.faces.sans.widthOfTextAtSize(label, 8) + 10 : 0;
    if (label) {
      book.page.drawText(label, {
        x: book.left,
        y: book.y - 13,
        size: 8,
        font: book.faces.sans,
        color: row.stance === "inconclusive" ? QUIET : MUTED,
      });
    }
    book.page.drawText(row.title, {
      x: book.left + stanceWidth,
      y: book.y - 13,
      size: row.absent ? 11 : 13,
      font: row.absent ? book.faces.sans : book.faces.serif,
      color: row.absent ? MUTED : INK,
    });
    if (row.folio) {
      book.page.drawText(row.folio, {
        x: book.left + book.width - book.faces.sans.widthOfTextAtSize(row.folio, 9),
        y: book.y - 12,
        size: 9,
        font: book.faces.sans,
        color: MUTED,
      });
    }
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
  const planned = page.sequence.find((item) => item.folio === sheet.folio);
  const figure = planned?.figure;
  const quote =
    sheet.intent.composition === "quote-led" ? planned?.pullQuotes?.[0] : undefined;
  if (quote) {
    write(book, quote, book.faces.serifIt, 16, 22);
    book.y -= 8;
  }
  if (sheet.intent.composition === "visual-opener" && figure) {
    await drawFigure(book, figure.url, sheet.folio, figure.caption, figure.credit);
  }
  const headSize = sheet.intent.treatment === "feature" ? 30 : sheet.intent.treatment === "compact" ? 20 : 26;
  write(book, sheet.headline, book.faces.serif, headSize, headSize + 4);
  if (sheet.intent.composition !== "visual-opener" && figure) {
    await drawFigure(book, figure.url, sheet.folio, figure.caption, figure.credit);
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
    const blocks = planned?.blocks?.length
      ? planned.blocks.filter((block) => !(quote && block.kind === "pullQuote" && block.text === quote))
      : sheet.paragraphs.map((text) => ({ kind: "paragraph" as const, text }));
    for (const block of blocks) {
      book.y -= 4;
      if (block.kind === "subhead") {
        write(book, block.text, book.faces.serif, 13, 18);
        continue;
      }
      if (block.kind === "pullQuote") {
        write(book, block.text, book.faces.serifIt, 13, 18);
        continue;
      }
      write(book, block.text, book.faces.serif, 11, 16);
    }
    closePiece(book, sheet, planned);
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
  closePiece(book, sheet, planned);
}

function closePiece(
  book: Book,
  sheet: Extract<PrintSheet, { kind: "piece" }>,
  planned: PagePlan["sequence"][number] | undefined,
) {
  if (sheet.intent.treatment === "screening" && planned?.videoUrl) {
    drawQr(book, planned.videoUrl, sheet.folio);
  }
  if (planned?.colophon) {
    book.y -= 18;
    write(book, planned.colophon, book.faces.sans, 8, 12, MUTED);
  }
}

function drawQr(book: Book, url: string, folio: string) {
  const { data, size } = qrMatrix(url);
  const cell = 2.4;
  const qr = size * cell;
  need(book, qr + 16, folio);
  book.y -= 8;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!data[y]?.[x]) continue;
      book.page.drawRectangle({
        x: book.left + x * cell,
        y: book.y - (y + 1) * cell,
        width: cell,
        height: cell,
        color: INK,
      });
    }
  }
  book.y -= qr + 12;
}

async function drawFigure(book: Book, url: string, folio: string, caption?: string, credit?: string) {
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
  book.y -= h + 10;
  if (caption) write(book, caption, book.faces.sans, 8, 11, MUTED);
  if (credit) write(book, credit, book.faces.sans, 8, 11, MUTED);
  book.y -= 6;
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
