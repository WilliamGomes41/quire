import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
  nothingSelected,
  productName,
  readLine,
  removeLabel,
  sourceHeadlineCopy,
  sourceLabel,
} from "../copy";
import { createIssue } from "../lib/bind";
import { hostnameOf, keptFigure, keptHeading, keptSnippet, paperBadgeLabel, relatedRow } from "../lib/kept";
import { saveClip, type Clip } from "../lib/save";
import { chosenFromBoard, chosenPieces, defaultBindChoice, type BindChoice } from "../lib/select";
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
  .validator(
    (data: { selections: { clipId: string; includeOriginal: boolean; relatedUrls: string[] }[] }) =>
      data,
  )
  .handler(async ({ data }) => {
    const clips = await clipStore();
    const items = [];
    for (const selection of data.selections) {
      const clip = await clips.get(selection.clipId);
      if (!clip) continue;
      items.push({
        clip,
        choice: {
          includeOriginal: selection.includeOriginal,
          relatedUrls: selection.relatedUrls,
        },
      });
    }
    const issue = await createIssue({ items }, await issueStore());
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
  const [choices, setChoices] = useState<Record<string, BindChoice>>({});
  const [bindError, setBindError] = useState("");

  const board = useMemo(
    () =>
      clips.map((clip: Clip) => ({
        clip,
        choice: choices[clip.id] ?? defaultBindChoice(),
      })),
    [clips, choices],
  );

  function setChoice(id: string, choice: BindChoice) {
    setChoices((current) => ({ ...current, [id]: choice }));
  }

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
        {clips.length === 0 ? (
          <p className="empty">{emptyState}</p>
        ) : (
          <>
            <ul className="cards">
              {clips.map((clip: Clip) => (
                <li key={clip.id}>
                  <BindCard
                    clip={clip}
                    choice={choices[clip.id] ?? defaultBindChoice()}
                    onChoice={(choice) => setChoice(clip.id, choice)}
                    onRemove={() =>
                      removeKept({ data: { id: clip.id } }).then(() => router.invalidate())
                    }
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                const selected = chosenFromBoard(board);
                if (selected.length === 0) {
                  setBindError(nothingSelected);
                  return;
                }
                setBindError("");
                bindIssue({
                  data: {
                    selections: board
                      .filter(({ clip, choice }) => chosenPieces(clip, choice).length > 0)
                      .map(({ clip, choice }) => ({
                        clipId: clip.id,
                        includeOriginal: choice.includeOriginal,
                        relatedUrls: choice.relatedUrls,
                      })),
                  },
                }).then(
                  (result) =>
                    router.invalidate().then(() =>
                      router.navigate({ to: "/read/$id", params: { id: result.id } }),
                    ),
                  (cause: unknown) => {
                    setBindError(cause instanceof Error ? cause.message : "Could not bind this issue.");
                  },
                );
              }}
            >
              {createIssueLabel}
            </button>
            {bindError ? <p className="fail">{bindError}</p> : null}
          </>
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
  choice,
  onChoice,
  onRemove,
}: {
  clip: Clip;
  choice: BindChoice;
  onChoice: (choice: BindChoice) => void;
  onRemove: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const host = hostnameOf(clip.url);
  const heading = keptHeading(clip);
  const snippet = keptSnippet(clip.sourceHeadline);
  const figure = keptFigure(clip.sourceHeadline);
  const badge = paperBadgeLabel(clip.understanding);
  const keptOn = clip.savedAt.slice(0, 10);
  const topic = clip.understanding?.status === "ok" ? clip.understanding.topic : "";
  const headlineSpoken =
    clip.sourceHeadline && clip.sourceHeadline.status !== "ok"
      ? sourceHeadlineCopy(clip.sourceHeadline)
      : null;
  const date =
    (clip.understanding?.status === "ok" && clip.understanding.date) || keptOn;
  const secondary =
    clip.sourceHeadline?.status === "ok"
      ? [date, topic].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index)
      : [date].filter(Boolean);

  return (
    <article className={choice.includeOriginal ? "card in" : "card"}>
      <label className="choice include">
        <input
          type="checkbox"
          checked={choice.includeOriginal}
          onChange={(event) => {
            onChoice({ ...choice, includeOriginal: event.target.checked });
          }}
        />
        <span className="tile">
          <header>
            <h3 className="display">{heading}</h3>
            {badge ? <span className="badge">{badge}</span> : null}
          </header>
          {snippet ? <p className="note">{snippet}</p> : null}
          {figure ? (
            <span className="figure">
              <img src={figure} alt="" />
            </span>
          ) : null}
          {secondary.length > 0 ? <p className="folio">{secondary.join(" · ")}</p> : null}
          {headlineSpoken ? (
            <p className={headlineSpoken.kind === "fail" ? "fail" : "empty"}>
              {headlineSpoken.text}
              {clip.sourceHeadline?.status === "failed" ? ` ${clip.sourceHeadline.message}` : ""}
            </p>
          ) : null}
          <UnderstandingFail clip={clip} />
        </span>
      </label>
      <p className="actions">
        <span className="source">{host || sourceLabel}</span>
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
      <RelatedSelect
        clip={clip}
        selected={choice.relatedUrls}
        onToggle={(url, on) => {
          onChoice({
            ...choice,
            relatedUrls: on
              ? [...choice.relatedUrls, url]
              : choice.relatedUrls.filter((item) => item !== url),
          });
        }}
      />
      {error ? <p className="fail">{error}</p> : null}
    </article>
  );
}

function UnderstandingFail({ clip }: { clip: Clip }) {
  const record = clip.understanding;
  if (!record || record.status !== "failed") return null;
  return (
    <p className="fail">
      {couldNotUnderstand} {record.message}
    </p>
  );
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
        <p className="empty">{nothingMoreOnTopic}</p>
      </section>
    );
  }

  return (
    <section className="rail">
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
                  {row.snippet ? <span className="note">{row.snippet}</span> : null}
                  {row.detail ? <span className="folio">{row.detail}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
