import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { productName } from "../copy";
import { composeIssue, readingSheets, type SequenceSheet, type SheetFigure } from "../lib/compose";
import { issueStore } from "../lib/store";

const loadIssue = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const issues = await issueStore();
    return issues.get(data.id);
  });

export const Route = createFileRoute("/read/$id")({
  loader: ({ params }) => loadIssue({ data: { id: params.id } }),
  component: ReadIssue,
});

function ReadIssue() {
  const issue = Route.useLoaderData();
  const [index, setIndex] = useState(0);

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

  const page = composeIssue(issue);
  const sheets = readingSheets(page);
  const last = sheets.length - 1;
  const current = sheets[Math.min(Math.max(index, 0), last)] ?? sheets[0];
  const piece = current?.kind === "piece" ? page.sequence[current.index] : undefined;

  return (
    <main className="stage">
      <nav className="stage-chrome">
        <Link to="/">{productName}</Link>
        <div className="stage-turn">
          <button type="button" disabled={index <= 0} onClick={() => setIndex((n) => Math.max(0, n - 1))}>
            Previous
          </button>
          <span>
            {String(index + 1).padStart(2, "0")} / {String(sheets.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            disabled={index >= last}
            onClick={() => setIndex((n) => Math.min(last, n + 1))}
          >
            Next
          </button>
        </div>
      </nav>
      <div className="stage-well">
        {current?.kind === "cover" ? (
          <article className="sheet sheet-cover" data-sheet="cover">
            {page.cover.figure ? <SheetPhoto figure={page.cover.figure} /> : null}
            <div className="cover-content">
              {page.cover.kicker ? <p className="kicker">{page.cover.kicker}</p> : null}
              <p className="masthead">{page.cover.masthead}</p>
              <div className="accent-rule" />
              <h1>{page.cover.title}</h1>
              {page.cover.lead ? <p className="cover-lead">{page.cover.lead}</p> : null}
              {page.cover.meta ? <p className="cover-meta">{page.cover.meta}</p> : null}
            </div>
          </article>
        ) : null}
        {current?.kind === "contents" ? (
          <article className="sheet sheet-contents" data-sheet="contents">
            <div className="running-head">
              <span>{productName}</span>
              <span className="folio">{page.contents.folio}</span>
            </div>
            <div className="contents-heading">
              <p className="kicker">{page.contents.kicker}</p>
              <h2>{page.contents.title}</h2>
            </div>
            <ol className="contents-list">
              {page.contents.rows.map((row) => (
                <li key={row.folio} className="toc-row">
                  <p className="toc-title">{row.title}</p>
                  <span className="toc-dots" aria-hidden />
                  <span className="folio">{row.folio}</span>
                </li>
              ))}
            </ol>
          </article>
        ) : null}
        {piece ? <PieceSheet sheet={piece} /> : null}
      </div>
    </main>
  );
}

function PieceSheet({ sheet }: { sheet: SequenceSheet }) {
  const firstLong = sheet.paragraphs.findIndex((paragraph) => paragraph.length > 80);
  return (
    <article
      className="sheet sheet-piece"
      data-sheet="piece"
      data-treatment={sheet.intent.treatment}
      data-composition={sheet.intent.composition}
      data-flow={sheet.intent.body_flow}
    >
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
    </article>
  );
}

function SheetPhoto({ figure }: { figure: SheetFigure }) {
  return (
    <figure className={figure.fit === "cover" ? "sheet-figure cover" : "sheet-figure contain"}>
      <img src={figure.url} alt="" />
    </figure>
  );
}
