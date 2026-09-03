import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { couldNotPrint, printThisIssue, productName } from "../copy";
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
import { composePrint, offerPrint, paperNameFor } from "../lib/print";
import { issueStore } from "../lib/store";

const TURN_MS = 280;

const loadIssue = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const issues = await issueStore();
    return issues.get(data.id);
  });

const composeBoundPrint = createServerFn({ method: "POST" })
  .validator((data: { id: string; paper?: "a4" | "letter" }) => data)
  .handler(async ({ data }) => {
    const issues = await issueStore();
    const issue = await issues.get(data.id);
    if (!issue) throw new Error(couldNotPrint);
    const paper = data.paper === "letter" || data.paper === "a4" ? data.paper : paperNameFor();
    const bytes = await composePrint(issue, paper);
    return { bytes: Buffer.from(bytes).toString("base64"), paper };
  });

export const Route = createFileRoute("/read/$id")({
  loader: ({ params }) => loadIssue({ data: { id: params.id } }),
  component: ReadIssue,
});

function ReadIssue() {
  const issue = Route.useLoaderData();
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
          <Link to="/">{productName}</Link>
        </nav>
        <p className="stage-empty">That issue is not here.</p>
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
        <Link to="/">{productName}</Link>
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
          <button type="button" className="stage-print" disabled={printing} onClick={printBound}>
            {printThisIssue}
          </button>
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
                {page.contents.rows.map((row, rowIndex) => (
                  <li key={row.folio}>
                    <button type="button" className="toc-row" onClick={() => goTo(pieceSheetIndex(rowIndex))}>
                      <p className="toc-title">{row.title}</p>
                      <span className="toc-dots" aria-hidden />
                      <span className="folio">{row.folio}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {piece ? <PieceSheet sheet={piece} /> : null}
        </article>
      </div>
    </main>
  );
}

function PieceSheet({ sheet }: { sheet: SequenceSheet }) {
  const firstLong = sheet.paragraphs.findIndex((paragraph) => paragraph.length > 80);
  return (
    <>
      <div className="running-head">
        <span>{productName}</span>
        <span className="folio">{sheet.folio}</span>
      </div>
      {sheet.intent.composition === "visual-opener" && sheet.figure ? (
        <SheetPhoto figure={sheet.figure} />
      ) : null}
      <header className="piece-header">
        <h2>{sheet.headline}</h2>
      </header>
      {sheet.intent.composition !== "visual-opener" && sheet.figure ? (
        <SheetPhoto figure={sheet.figure} />
      ) : null}
      {sheet.take ? (
        <aside className="take">
          <p>{sheet.take.text}</p>
        </aside>
      ) : null}
      <div className="piece-body">
        {sheet.paragraphs.map((paragraph, index) => (
          <p key={`${sheet.folio}-${index}`} className={index === firstLong ? "drop" : undefined}>
            {paragraph}
          </p>
        ))}
      </div>
    </>
  );
}

function SheetPhoto({ figure }: { figure: SheetFigure }) {
  return (
    <figure className={figure.fit === "cover" ? "sheet-figure cover" : "sheet-figure contain"}>
      <img src={figure.url} alt="" />
    </figure>
  );
}
