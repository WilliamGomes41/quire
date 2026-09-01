import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  couldNotUnderstand,
  dek,
  emptyState,
  headline,
  keepHint,
  keptNote,
  kicker,
  moreOnThisTopic,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
  productName,
  suggestionsUntilSelected,
} from "../copy";
import { saveClip, type Clip } from "../lib/save";
import { clipStore, listClips } from "../lib/store";
import { resolveSearchPages } from "../lib/search";
import { runGrokUnderstanding } from "../lib/understanding";

const loadClips = createServerFn({ method: "GET" }).handler(async () => {
  return listClips();
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

export const Route = createFileRoute("/")({
  loader: () => loadClips(),
  component: Home,
});

function Home() {
  const router = useRouter();
  const clips = Route.useLoaderData();

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
          const form = event.currentTarget;
          const url = String(new FormData(form).get("url") ?? "");
          keepUrl({ data: { url } }).then(() => {
            form.reset();
            return router.invalidate();
          });
        }}
      >
        <label htmlFor="url">URL</label>
        <input id="url" name="url" type="url" required placeholder="https://" />
        <button type="submit">Keep</button>
      </form>
      <p className="empty">{keepHint}</p>

      {clips.length === 0 ? (
        <p className="empty">{emptyState}</p>
      ) : (
        <ul>
          {clips.map((clip: Clip) => (
            <li key={clip.id}>
              <a href={clip.url}>{clip.url}</a>
              <UnderstandingNote clip={clip} />
              <RelatedNote clip={clip} />
            </li>
          ))}
        </ul>
      )}
    </main>
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
  return (
    <p className="note">
      {record.contentType}. {record.topic}
      {record.entities.length > 0 ? ` — ${record.entities.join(", ")}` : ""}
      {record.date ? ` (${record.date})` : ""}
    </p>
  );
}

function RelatedNote({ clip }: { clip: Clip }) {
  const rail = clip.relatedRail;
  if (!rail) return null;

  if (rail.status !== "ok") {
    const copy = moreOnThisTopicCopy({ status: rail.status, count: 0 });
    return (
      <section className="rail">
        <h2>{moreOnThisTopic}</h2>
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
        <h2>{moreOnThisTopic}</h2>
        <p className="empty">{nothingMoreOnTopic}</p>
      </section>
    );
  }

  return (
    <section className="rail">
      <h2>{moreOnThisTopic}</h2>
      <p className="note">{suggestionsUntilSelected}</p>
      <ul>
        {pages.map((page) => (
          <li key={page.url}>
            <a href={page.url}>{page.title || page.url}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
