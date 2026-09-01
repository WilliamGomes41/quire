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
  productName,
} from "../copy";
import { saveClip, type Clip } from "../lib/save";
import { clipStore, listClips } from "../lib/store";
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
