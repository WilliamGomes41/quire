# Quire

A personal press for one reader.

Save the links. Bind the issue.

New Quire. Not a patch on quire-bind.

For people who like to keep articles for calm later reading. Paste a URL. It stays.

## This slice

Keep always saves. A clip is written first. Then one Grok understanding (content type, topic, entities, optional date). Grok only structures the topic. It does not search or pick URLs.

Then the More on this topic rail. Retrieval is a provider slot: one dedicated search API behind a function/config. The search API finds pages (raw). The app normalizes, dedupes, ranks, and persists at most five `related_reporting`.

The kept card shows the stored source headline when Keep could read one. Host and topic stay secondary. Source is the publisher as a quiet word, not a leaving link. A source-owned snippet sits under the headline. A figure shows only when Keep already stored one from the source. Remove takes a clip off the pile. Related stay checkboxes until selected; stored snippet sits under the title, or publisher · date when there is none. The Select board is a two-column paper pile on a wide viewport, with one Create issue for the board. Keep stays at the top.

Then Select → Create issue → Read. An issue is whatever you choose to bind. The kept piece is in unless you take it out. Related reporting joins only when you select it. Suggestions stay suggestions until then.

Create issue fetches the author's original words and locks them. Magazine is that bound issue — a readable sheet, not a restyle of a URL list. Cards open that page: cover, contents, then a sequence of square sheets. Original words are recomposed on the sheet. A take may sit as unlabeled italic between hairlines. It is optional. It is not a TL;DR kicker. The page still reads if the take is missing. The folio is not the raw source URL.

Search failure, understanding failure, a failed take, or a failed bind do not fail Keep.

Canonical law lives in [quire-bind PROTOCOL.md @ 444e429](https://github.com/WilliamGomes41/quire-bind/blob/444e4299778d0297a889675426e45f87a66fb88f/PROTOCOL.md) (v0.8.3). Do not treat this README as PROTOCOL.

## Stack

TanStack Start, Better Auth, PGLite (or Postgres/Neon when `DATABASE_URL` is set), xAI `grok-4.6` for Keep understanding and the optional take, one dedicated search API in the retrieval slot.

## Develop

```bash
npm install
cp .env.example .env
npm test
npm run dev
```
