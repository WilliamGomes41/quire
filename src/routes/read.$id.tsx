import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { productName, takeLabel } from "../copy";
import { composeIssue } from "../lib/compose";
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
  const spread = page.intent.take_slot === "body-with-sidebar" && page.take;

  return (
    <main className="page" data-treatment={page.intent.treatment}>
      <nav>
        <Link to="/">{productName}</Link>
      </nav>
      <header className="opener">
        <p className="kicker">Bound issue</p>
        <h1>{page.opener.title}</h1>
        <p className="folio">
          <a href={page.opener.source}>{page.opener.source}</a>
        </p>
      </header>
      <div className={spread ? "spread" : "column"}>
        {page.take ? (
          <aside className="aside">
            <p className="kicker">{takeLabel}</p>
            <p>{page.take.text}</p>
          </aside>
        ) : null}
        <article className="lead-copy">
          <h2>{page.lead.headline}</h2>
          {page.lead.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </article>
      </div>
      {page.secondary.length > 0 ? (
        <section className="secondary">
          {page.secondary.map((piece) => (
            <article key={piece.url} className="lead-copy">
              <h2>{piece.headline}</h2>
              {piece.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
              <p className="folio">
                <a href={piece.url}>{piece.url}</a>
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
