import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { productName } from "../copy";
import { composeIssue, type SequenceSheet, type SheetFigure } from "../lib/compose";
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

  if (!issue) {
    return (
      <main className="page">
        <nav>
          <Link to="/">{productName}</Link>
        </nav>
        <p className="empty">That issue is not here.</p>
      </main>
    );
  }

  const page = composeIssue(issue);

  return (
    <main className="page issue">
      <nav className="issue-nav">
        <Link to="/">{productName}</Link>
      </nav>
      <div className="sheets">
        <article className="sheet sheet-cover" data-sheet="cover">
          {page.cover.figure ? <SheetPhoto figure={page.cover.figure} /> : null}
          <div className="cover-content">
            <p className="kicker">{page.cover.kicker}</p>
            <p className="masthead">{page.cover.masthead}</p>
            <div className="accent-rule" />
            <h1>{page.cover.title}</h1>
            <p className="cover-lead">Inside · {page.cover.lead}</p>
            {page.cover.meta ? <p className="cover-meta">{page.cover.meta}</p> : null}
          </div>
        </article>

        <article className="sheet sheet-contents" data-sheet="contents">
          <div className="running-head">
            <span>{productName}</span>
            <span className="folio">Contents</span>
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

        {page.sequence.map((sheet) => (
          <PieceSheet key={sheet.folio} sheet={sheet} />
        ))}
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
