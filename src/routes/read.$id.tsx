import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { couldNotFetchWords, couldNotPrint, printThisIssue, productName } from "../copy";
import { issueFromKeptWords } from "../lib/bind";
import { fetchArticleWords } from "../lib/article";
import type { BodyBlock } from "../lib/article";
import {
  clampSheetIndex,
  composeIssue,
  nextSheetIndex,
  pieceSheetIndex,
  previousSheetIndex,
  readingSheets,
  type SequenceSheet,
  type SheetFigure,
} from "../lib/compose";
import { qrMatrix } from "../lib/qr";
import { composeBoundPrint } from "../lib/print-bound";
import { offerPrint, paperNameFor } from "../lib/print";
import { clipStore, issueStore } from "../lib/store";
import { QuireMark } from "../mark";

const TURN_MS = 280;

const loadIssue = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const issues = await issueStore();
    const bound = await issues.get(data.id);
    if (bound) return { bound: true as const, issue: bound };
    const clip = await (await clipStore()).get(data.id);
    if (!clip) return { bound: false as const, issue: null };
    try {
      const words = await fetchArticleWords(clip.url);
      return { bound: false as const, issue: issueFromKeptWords(clip, words) };
    } catch (error) {
      return {
        bound: false as const,
        issue: null,
        fail: error instanceof Error && error.message ? error.message : couldNotFetchWords,
      };
    }
  });

export const Route = createFileRoute("/read/$id")({
  loader: ({ params }) => loadIssue({ data: { id: params.id } }),
  component: ReadIssue,
});

function ReadIssue() {
  const payload = Route.useLoaderData();
  const issue = payload?.issue ?? null;
  const bound = payload?.bound === true;
  const [index, setIndex] = useState(0);
  const [turning, setTurning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!issue) {
    return (
      <main className="stage">
        <nav className="stage-chrome">
          <Link to="/" aria-label={productName}>
            <QuireMark />
          </Link>
        </nav>
        <p className="stage-empty">{payload?.fail ?? "That issue is not here."}</p>
      </main>
    );
  }

  const boundId = issue.id;
  const page = composeIssue(issue);
  const sheets = readingSheets(page);
  const last = sheets.length - 1;
  const current = sheets[clampSheetIndex(index, sheets.length)] ?? sheets[0];
  const piece = current?.kind === "piece" ? page.sequence[current.index] : undefined;
  const kind = current?.kind === "piece" ? "piece" : (current?.kind ?? "cover");
  const sheetClass = [
    "sheet",
    kind === "cover" ? "sheet-cover" : kind === "contents" ? "sheet-contents" : "sheet-piece",
    turning ? "is-turning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function goTo(target: number) {
    const next = clampSheetIndex(target, sheets.length);
    if (next === index || turning) return;
    const quiet =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quiet) {
      setIndex(next);
      return;
    }
    setTurning(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setIndex(next);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTurning(false);
          timer.current = null;
        });
      });
    }, TURN_MS);
  }

  function printBound() {
    if (printing) return;
    setPrinting(true);
    setPrintError("");
    composeBoundPrint({
      data: {
        id: boundId,
        paper: paperNameFor(typeof navigator !== "undefined" ? navigator.language : "en-GB"),
      },
    })
      .then((result) => {
        offerPrint(result.bytes);
      })
      .catch((cause: unknown) => {
        setPrintError(cause instanceof Error && cause.message ? cause.message : couldNotPrint);
      })
      .finally(() => setPrinting(false));
  }

  return (
    <main className="stage">
      <nav className="stage-chrome">
        <Link to="/" aria-label={productName}>
          <QuireMark />
        </Link>
        <div className="stage-tools">
          <div className="stage-turn">
            <button
              type="button"
              disabled={index <= 0 || turning}
              onClick={() => goTo(previousSheetIndex(index, sheets.length))}
            >
              Previous
            </button>
            <span>
              {String(index + 1).padStart(2, "0")} / {String(sheets.length).padStart(2, "0")}
            </span>
            <button
              type="button"
              disabled={index >= last || turning}
              onClick={() => goTo(nextSheetIndex(index, sheets.length))}
            >
              Next
            </button>
          </div>
          {bound ? (
            <button type="button" className="stage-print" disabled={printing} onClick={printBound}>
              {printThisIssue}
            </button>
          ) : null}
        </div>
      </nav>
      {printError ? <p className="stage-empty">{printError}</p> : null}
      <div className="stage-well">
        <article
          className={sheetClass}
          data-sheet={kind}
          data-treatment={piece?.intent.treatment}
          data-composition={piece?.intent.composition}
          data-flow={piece?.intent.body_flow}
        >
          {current?.kind === "cover" ? (
            <>
              {page.cover.figure ? <SheetPhoto figure={page.cover.figure} /> : null}
              <div className="cover-content">
                {page.cover.kicker ? <p className="kicker">{page.cover.kicker}</p> : null}
                <p className="masthead">{page.cover.masthead}</p>
                <div className="accent-rule" />
                <h1>{page.cover.title}</h1>
                {page.cover.lead ? <p className="cover-lead">{page.cover.lead}</p> : null}
                {page.cover.meta ? <p className="cover-meta">{page.cover.meta}</p> : null}
              </div>
            </>
          ) : null}
          {current?.kind === "contents" ? (
            <>
              <div className="running-head">
                <span>{productName}</span>
                <span className="folio">{page.contents.folio}</span>
              </div>
              <div className="contents-heading">
                <p className="kicker">{page.contents.kicker}</p>
                <h2>{page.contents.title}</h2>
              </div>
              <ol className="contents-list">
                {page.contents.rows.map((row, rowIndex) =>
                  row.absent ? (
                    <li key={`absent-${row.title}`}>
                      <p className="toc-absent">{row.title}</p>
                    </li>
                  ) : (
                    <li key={row.folio}>
                      <button type="button" className="toc-row" onClick={() => goTo(pieceSheetIndex(rowIndex))}>
                        <p className="toc-title">{row.title}</p>
                        <span className="toc-dots" aria-hidden />
                        <span className="folio">{row.folio}</span>
                      </button>
                    </li>
                  ),
                )}
              </ol>
            </>
          ) : null}
          {piece ? <PieceSheet sheet={piece} /> : null}
        </article>
      </div>
    </main>
  );
}

function pieceBlocks(sheet: SequenceSheet): BodyBlock[] {
  if (sheet.blocks?.length) {
    if (sheet.intent.composition === "quote-led" && sheet.pullQuotes?.[0]) {
      const leadQuote = sheet.pullQuotes[0];
      let skipped = false;
      return sheet.blocks.filter((block) => {
        if (!skipped && block.kind === "pullQuote" && block.text === leadQuote) {
          skipped = true;
          return false;
        }
        return true;
      });
    }
    return sheet.blocks;
  }
  return sheet.paragraphs.map((text) => ({ kind: "paragraph" as const, text }));
}

function PieceSheet({ sheet }: { sheet: SequenceSheet }) {
  const screening = sheet.intent.treatment === "screening";
  const opener = sheet.intent.composition === "visual-opener" && sheet.figure;
  const quote = sheet.intent.composition === "quote-led" ? sheet.pullQuotes?.[0] : undefined;
  const blocks = pieceBlocks(sheet);
  const firstLong = blocks.findIndex((block) => block.kind === "paragraph" && block.text.length > 80);
  return (
    <>
      <div className="running-head">
        <span>{productName}</span>
        <span className="folio">{sheet.folio}</span>
      </div>
      {quote ? (
        <blockquote className="pull-quote">
          <p>{quote}</p>
        </blockquote>
      ) : null}
      {opener ? <SheetPhoto figure={sheet.figure!} /> : null}
      <header className="piece-header">
        <h2>{sheet.headline}</h2>
      </header>
      {!opener && sheet.figure ? <SheetPhoto figure={sheet.figure} /> : null}
      {sheet.take ? (
        <aside className="take">
          <p>{sheet.take.text}</p>
        </aside>
      ) : null}
      <div className={screening ? "piece-body briefing" : "piece-body"}>
        {blocks.map((block, index) =>
          block.kind === "subhead" ? (
            <h3 key={`${sheet.folio}-h-${index}`}>{block.text}</h3>
          ) : block.kind === "pullQuote" ? (
            <blockquote key={`${sheet.folio}-q-${index}`} className="pull-quote">
              <p>{block.text}</p>
            </blockquote>
          ) : (
            <p
              key={`${sheet.folio}-${index}`}
              className={!screening && index === firstLong ? "drop" : undefined}
            >
              {block.text}
            </p>
          ),
        )}
      </div>
      {screening && sheet.videoUrl ? <SheetQr url={sheet.videoUrl} /> : null}
      {sheet.colophon ? <p className="colophon">{sheet.colophon}</p> : null}
    </>
  );
}

function SheetPhoto({ figure }: { figure: SheetFigure }) {
  return (
    <figure className={figure.fit === "cover" ? "sheet-figure cover" : "sheet-figure contain"}>
      <img src={figure.url} alt="" />
      {figure.caption || figure.credit ? (
        <figcaption>
          {figure.caption ? <span>{figure.caption}</span> : null}
          {figure.credit ? <span className="credit">{figure.credit}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

function SheetQr({ url }: { url: string }) {
  const { data, size } = qrMatrix(url);
  return (
    <svg
      className="sheet-qr"
      viewBox={`0 0 ${size} ${size}`}
      width={104}
      height={104}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {data.flatMap((row, y) =>
        row.flatMap((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : [],
        ),
      )}
    </svg>
  );
}
