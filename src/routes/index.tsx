import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  boundNote,
  couldNotUnderstand,
  createIssueLabel,
  emptyState,
  inLabel,
  keptNote,
  moreOnThisTopic,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
  nothingSelected,
  railAbsentCopy,
  stanceCopy,
  pressCoverMeta,
  pressEmpty,
  pressLabel,
  removeIssueAsk,
  removeLabel,
  removePiecesTooLabel,
  returnToDeskLabel,
  sourceHeadlineCopy,
  sourceLabel,
} from "../copy";
import { createIssue, type BoundIssue } from "../lib/bind";
import {
  hostnameOf,
  keptFigure,
  keptHeading,
  keptSnippet,
  paperBadgeLabel,
  relatedCollapsed,
  relatedCountLabel,
  relatedRow,
  relatedVisible,
} from "../lib/kept";
import { saveClip, type Clip } from "../lib/save";
import { chosenFromBoard, chosenPieces, defaultBindChoice, type BindChoice } from "../lib/select";
import {
  clipStore,
  deleteBoundIssue,
  issueStore,
  listClips,
  listIssues,
  takeBoundOffDesk,
} from "../lib/store";
import { resolveSearchPages } from "../lib/search";
import type { RelatedPage } from "../lib/related";
import { slotState } from "../lib/related-stance";
import { QuireMark } from "../mark";

const loadHome = createServerFn({ method: "GET" }).handler(async () => {
  const [clips, issues] = await Promise.all([listClips(), listIssues()]);
  return { clips, issues };
});

const keepUrl = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    const store = await clipStore();
    const clip = await saveClip({ url: data.url }, store, {
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
    await takeBoundOffDesk(issue.pieces.map((piece) => piece.url));
    return { note: boundNote, id: issue.id };
  });

const removeKept = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const store = await clipStore();
    await store.remove(data.id);
  });

const removeBound = createServerFn({ method: "POST" })
  .validator((data: { id: string; pieces: "return" | "discard" }) => data)
  .handler(async ({ data }) => {
    await deleteBoundIssue(data.id, data.pieces);
  });

export const Route = createFileRoute("/")({
  loader: () => loadHome(),
  component: Home,
});

function Home() {
  const router = useRouter();
  const { clips, issues } = Route.useLoaderData();
  const [keeping, setKeeping] = useState(false);
  const [binding, setBinding] = useState(false);
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
      <header className="site">
        <nav>
          <strong className="site-masthead">
            <QuireMark />
          </strong>
          <Link to="/login">Owner sign in</Link>
        </nav>
      </header>

      <div className="desk">
        <aside className="keep-rail">
          <form
            className="keep"
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
            <input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://"
              aria-label="URL"
              disabled={keeping}
            />
            <button type="submit" disabled={keeping} aria-busy={keeping}>
              {keeping ? "Keeping…" : "Keep"}
            </button>
          </form>
        </aside>

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
                disabled={binding}
                aria-busy={binding}
                onClick={() => {
                  if (binding) return;
                  const selected = chosenFromBoard(board);
                  if (selected.length === 0) {
                    setBindError(nothingSelected);
                    return;
                  }
                  setBindError("");
                  setBinding(true);
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
                  })
                    .then(
                      (result) =>
                        router.invalidate().then(() =>
                          router.navigate({ to: "/read/$id", params: { id: result.id } }),
                        ),
                      (cause: unknown) => {
                        setBindError(cause instanceof Error ? cause.message : "Could not bind this issue.");
                      },
                    )
                    .finally(() => setBinding(false));
                }}
              >
                {binding ? "Creating…" : createIssueLabel}
              </button>
              {bindError ? (
                <p className="fail" role="alert">
                  {bindError}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <section className="board press">
        <header className="press-shelf">
          <QuireMark />
          <h2>{pressLabel}</h2>
        </header>
        {issues.length === 0 ? (
          <p className="empty">{pressEmpty}</p>
        ) : (
          <ul className="covers">
            {issues.map((issue) => (
              <li key={issue.id}>
                <BoundCover
                  issue={issue}
                  onRemove={(pieces) =>
                    removeBound({ data: { id: issue.id, pieces } }).then(() => router.invalidate())
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function BoundCover({
  issue,
  onRemove,
}: {
  issue: BoundIssue;
  onRemove: (pieces: "return" | "discard") => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  function choose(pieces: "return" | "discard") {
    setError("");
    onRemove(pieces).then(
      () => undefined,
      (cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not remove this issue.");
      },
    );
  }

  return (
    <article>
      <Link className="cover" to="/read/$id" params={{ id: issue.id }}>
        <strong className="display">{issue.title}</strong>
        <span className="folio">{pressCoverMeta(issue)}</span>
      </Link>
      {asking ? (
        <>
          <p className="empty">{removeIssueAsk}</p>
          <p className="actions">
            <button type="button" className="quiet" onClick={() => choose("return")}>
              {returnToDeskLabel}
            </button>
            <button type="button" className="quiet" onClick={() => choose("discard")}>
              {removePiecesTooLabel}
            </button>
          </p>
        </>
      ) : (
        <p className="actions">
          <button type="button" className="quiet" onClick={() => setAsking(true)}>
            {removeLabel}
          </button>
        </p>
      )}
      {error ? <p className="fail">{error}</p> : null}
    </article>
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
  const kind = paperBadgeLabel(clip.understanding);
  const snippet = keptSnippet(clip.sourceHeadline);
  const figure = keptFigure(clip.sourceHeadline);
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
    <article className={[choice.includeOriginal ? "card in" : "card", figure ? "photo" : ""].filter(Boolean).join(" ")}>
      {figure ? (
        <span className="figure">
          <img src={figure} alt="" />
        </span>
      ) : null}
      <header>
        {kind ? (
          <span className="badge" data-mark={kind}>
            {kind}
          </span>
        ) : null}
        <h3 className="display">
          <Link to="/read/$id" params={{ id: clip.id }}>
            {heading}
          </Link>
        </h3>
      </header>
      {snippet ? <p className="note">{snippet}</p> : null}
      {secondary.length > 0 ? <p className="folio">{secondary.join(" · ")}</p> : null}
      {headlineSpoken ? (
        <p className={headlineSpoken.kind === "fail" ? "fail" : "empty"}>
          {headlineSpoken.text}
        </p>
      ) : null}
      <UnderstandingFail clip={clip} />
      <p className="actions">
        <button
          type="button"
          className="include"
          aria-pressed={choice.includeOriginal}
          aria-label={inLabel}
          onClick={() => onChoice({ ...choice, includeOriginal: !choice.includeOriginal })}
        >
          <span className="tick" aria-hidden />
        </button>
        <a className="source" href={clip.url} target="_blank" rel="noreferrer">
          {host || sourceLabel}
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
  const [open, setOpen] = useState(false);
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

  const visible = relatedVisible(pages, selected);
  const collapsed = relatedCollapsed(pages, selected);
  const count = relatedCountLabel(pages.length);
  const comparableSlot = slotState(pages, "comparable");
  const contrarianSlot = slotState(pages, "contrarian");

  return (
    <section className="rail">
      <h3>
        <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          {moreOnThisTopic}
          {count ? <span className="tally">{count}</span> : null}
        </button>
      </h3>
      {visible.length > 0 ? (
        <ul>
          {visible.map((page) => (
            <RelatedItem key={page.url} page={page} on={selected.includes(page.url)} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
      {collapsed.length > 0 ? (
        <div className={open ? "roll is-open" : "roll"}>
          <ul className="roll-inner">
            {collapsed.map((page) => (
              <RelatedItem key={page.url} page={page} on={selected.includes(page.url)} onToggle={onToggle} />
            ))}
          </ul>
        </div>
      ) : null}
      {comparableSlot === "absent" || contrarianSlot === "absent" ? (
        <ul className="absent">
          {comparableSlot === "absent" ? (
            <li>
              <span className="stance">{railAbsentCopy("comparable")}</span>
            </li>
          ) : null}
          {contrarianSlot === "absent" ? (
            <li>
              <span className="stance">{railAbsentCopy("contrarian")}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function RelatedItem({
  page,
  on,
  onToggle,
}: {
  page: RelatedPage;
  on: boolean;
  onToggle: (url: string, on: boolean) => void;
}) {
  const row = relatedRow(page);
  return (
    <li>
      <button
        type="button"
        className="related-title"
        aria-pressed={on}
        onClick={() => onToggle(page.url, !on)}
      >
        {row.title}
      </button>
      {row.stance ? (
        <span className={row.stance === "inconclusive" ? "stance quiet" : "stance"}>
          {stanceCopy(row.stance)}
        </span>
      ) : null}
      {row.snippet ? <span className="note">{row.snippet}</span> : null}
      {row.detail ? <span className="folio">{row.detail}</span> : null}
      <button
        type="button"
        className="include"
        aria-pressed={on}
        aria-label={inLabel}
        onClick={() => onToggle(page.url, !on)}
      >
        <span className="tick" aria-hidden />
      </button>
    </li>
  );
}
