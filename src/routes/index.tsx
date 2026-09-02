import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  boundEmpty,
  boundNote,
  couldNotUnderstand,
  createIssueLabel,
  dek,
  emptyState,
  headline,
  keepHint,
  keptNote,
  kicker,
  moreOnThisTopic,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
  originalInByDefault,
  productName,
  readLine,
  relatedJoinWhenSelected,
  removeLabel,
  selectLine,
  sourceLabel,
  suggestionsUntilSelected,
} from "../copy";
import { createIssue } from "../lib/bind";
import { hostnameOf, keptHeading, paperBadgeLabel, relatedRow } from "../lib/kept";
import { saveClip, type Clip } from "../lib/save";
import { defaultBindChoice } from "../lib/select";
import { clipStore, issueStore, listClips, listIssues } from "../lib/store";
import { resolveSearchPages } from "../lib/search";
import { runGrokUnderstanding } from "../lib/understanding";

const loadHome = createServerFn({ method: "GET" }).handler(async () => {
  const [clips, issues] = await Promise.all([listClips(), listIssues()]);
  return { clips, issues };
});

const keepUrl = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    const store = await clipStore();
    const clip = await saveClip({ url: data.url }, store, {
      understand: (kept) => runGrokUnderstanding({ url: kept.url }),
      searchPages: resolveSearchPages(),
    });
    return { note: keptNote, clip };
  });

const bindIssue = createServerFn({ method: "POST" })
  .validator((data: { clipId: string; includeOriginal: boolean; relatedUrls: string[] }) => data)
  .handler(async ({ data }) => {
    const clips = await clipStore();
    const clip = await clips.get(data.clipId);
    if (!clip) {
      throw new Error("Keep that piece first.");
    }
    const issue = await createIssue(
      {
        clip,
        choice: {
          includeOriginal: data.includeOriginal,
          relatedUrls: data.relatedUrls,
        },
      },
      await issueStore(),
    );
    return { note: boundNote, id: issue.id };
  });

const removeKept = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const store = await clipStore();
    await store.remove(data.id);
  });

export const Route = createFileRoute("/")({
  loader: () => loadHome(),
  component: Home,
});

function Home() {
  const router = useRouter();
  const { clips, issues } = Route.useLoaderData();
  const [keeping, setKeeping] = useState(false);

  return (
    <main>
      <nav>
        <strong className="display">{productName}</strong>
        <Link to="/login">Owner sign in</Link>
      </nav>
      <p className="kicker">{kicker}</p>
      <h1>{headline}</h1>
      <p className="empty">{dek}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (keeping) return;
          const form = event.currentTarget;
          const url = String(new FormData(form).get("url") ?? "");
          setKeeping(true);
          keepUrl({ data: { url } })
            .then(() => {
              form.reset();
              return router.invalidate();
            })
            .finally(() => setKeeping(false));
        }}
      >
        <label htmlFor="url">URL</label>
        <input id="url" name="url" type="url" required placeholder="https://" disabled={keeping} />
        <button type="submit" disabled={keeping} aria-busy={keeping}>
          {keeping ? "Keeping…" : "Keep"}
        </button>
      </form>
      <p className="empty">{keepHint}</p>

      <section className="board">
        <h2>{selectLine}</h2>
        <p className="empty">{originalInByDefault}</p>
        {clips.length === 0 ? (
          <p className="empty">{emptyState}</p>
        ) : (
          <ul className="cards">
            {clips.map((clip: Clip) => (
              <li key={clip.id}>
                <BindCard
                  clip={clip}
                  onBind={(choice) =>
                    bindIssue({
                      data: {
                        clipId: clip.id,
                        includeOriginal: choice.includeOriginal,
                        relatedUrls: choice.relatedUrls,
                      },
                    }).then((result) =>
                      router.invalidate().then(() =>
                        router.navigate({ to: "/read/$id", params: { id: result.id } }),
                      ),
                    )
                  }
                  onRemove={() =>
                    removeKept({ data: { id: clip.id } }).then(() => router.invalidate())
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="board">
        <h2>{readLine}</h2>
        {issues.length === 0 ? (
          <p className="empty">{boundEmpty}</p>
        ) : (
          <ul className="covers">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link className="cover" to="/read/$id" params={{ id: issue.id }}>
                  <span className="kicker">Issue</span>
                  <strong className="display">{issue.title}</strong>
                  <span className="empty">{issue.pieces.length === 1 ? "One piece" : `${issue.pieces.length} pieces`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function BindCard({
  clip,
  onBind,
  onRemove,
}: {
  clip: Clip;
  onBind: (choice: { includeOriginal: boolean; relatedUrls: string[] }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [choice, setChoice] = useState(defaultBindChoice);
  const [error, setError] = useState("");
  const related = clip.relatedReporting ?? [];

  const host = hostnameOf(clip.url);
  const heading = keptHeading(clip);
  const badge = paperBadgeLabel(clip.understanding);
  const keptOn = clip.savedAt.slice(0, 10);

  return (
    <article className="card">
      <header>
        <p className="folio">
          {host}
          {keptOn ? ` · ${keptOn}` : ""}
        </p>
        <h3 className="display">{heading}</h3>
        {badge ? <span className="badge">{badge}</span> : null}
      </header>
      <p className="actions">
        <a className="source" href={clip.url} target="_blank" rel="noreferrer">
          {sourceLabel}
        </a>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setError("");
            onRemove().then(
              () => undefined,
              (cause: unknown) => {
                setError(cause instanceof Error ? cause.message : "Could not remove this keep.");
              },
            );
          }}
        >
          {removeLabel}
        </button>
      </p>
      <UnderstandingNote clip={clip} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          onBind(choice).then(
            () => undefined,
            (cause: unknown) => {
              setError(cause instanceof Error ? cause.message : "Could not bind this issue.");
            },
          );
        }}
      >
        <label className="choice">
          <input
            type="checkbox"
            checked={choice.includeOriginal}
            onChange={(event) => {
              setChoice((current) => ({ ...current, includeOriginal: event.target.checked }));
            }}
          />
          Kept piece
        </label>
        <RelatedSelect
          clip={clip}
          selected={choice.relatedUrls}
          onToggle={(url, on) => {
            setChoice((current) => ({
              ...current,
              relatedUrls: on
                ? [...current.relatedUrls, url]
                : current.relatedUrls.filter((item) => item !== url),
            }));
          }}
        />
        {related.length === 0 ? null : <p className="note">{relatedJoinWhenSelected}</p>}
        <button type="submit">{createIssueLabel}</button>
      </form>
      {error ? <p className="fail">{error}</p> : null}
    </article>
  );
}

function UnderstandingNote({ clip }: { clip: Clip }) {
  const record = clip.understanding;
  if (!record) return null;
  if (record.status === "failed") {
    return (
      <p className="fail">
        {couldNotUnderstand} {record.message}
      </p>
    );
  }
  const extras = [
    ...record.entities,
    ...(record.date ? [record.date] : []),
  ];
  if (extras.length === 0) return null;
  return <p className="note">{extras.join(" · ")}</p>;
}

function RelatedSelect({
  clip,
  selected,
  onToggle,
}: {
  clip: Clip;
  selected: string[];
  onToggle: (url: string, on: boolean) => void;
}) {
  const rail = clip.relatedRail;
  if (!rail) return null;

  if (rail.status !== "ok") {
    const copy = moreOnThisTopicCopy({ status: rail.status, count: 0 });
    return (
      <section className="rail">
        <h3>{moreOnThisTopic}</h3>
        <p className="fail">
          {copy.text} {rail.message}
        </p>
      </section>
    );
  }

  const pages = clip.relatedReporting ?? [];
  const copy = moreOnThisTopicCopy({ status: "ok", count: pages.length });
  if (copy.kind === "empty") {
    return (
      <section className="rail">
        <h3>{moreOnThisTopic}</h3>
        <p className="empty">{nothingMoreOnTopic}</p>
      </section>
    );
  }

  return (
    <section className="rail">
      <h3>{moreOnThisTopic}</h3>
      <p className="note">{suggestionsUntilSelected}</p>
      <ul>
        {pages.map((page) => {
          const row = relatedRow(page);
          return (
            <li key={page.url}>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={selected.includes(page.url)}
                  onChange={(event) => onToggle(page.url, event.target.checked)}
                />
                <span>
                  <span>{row.title}</span>
                  {row.host ? <span className="folio">{row.host}</span> : null}
                  {row.snippet ? <span className="note">{row.snippet}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
