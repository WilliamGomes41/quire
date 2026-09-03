# Quire

A personal press for one reader.

Save the links. Bind the issue.

New Quire. Not a patch on quire-bind.

For people who like to keep articles for calm later reading. Paste a URL. It stays.

## This slice

Keep always saves. A clip is written first. Then one Grok understanding (content type, topic, entities, optional date). Grok only structures the topic. It does not search or pick URLs.

Then the More on this topic rail. Retrieval is a provider slot: one dedicated search API behind a function/config. The search API finds pages (raw). The app normalizes, dedupes, ranks, and persists at most five `related_reporting`.

Keep and Select are a contemporary press board on paper `#F3EEE4`. A modest Source Serif site masthead sits above one paste. The tile heading is the stored source headline when Keep could read one, in Source Serif at board scale — not the Read cover display. Host and topic stay secondary. Source is the publisher as a quiet word, not a leaving link. A source-owned snippet sits under the headline. A figure shows only when Keep already stored one from the source, and photographs contain. Remove takes a clip off the pile. Related stay checkboxes until selected; stored snippet sits under the title, or publisher · date when there is none. The Select board is a two-column paper pile on a wide viewport, with one Create issue for the board. Empty selection does not bind. Keep is one paste, not a form stack. The board is not a dark stage and not a floating sheet — those stay on Read.

Then Select → Create issue → Read. An issue is whatever you choose to bind. The kept piece is in unless you take it out. Related reporting joins only when you select it. Suggestions stay suggestions until then.

Create issue fetches the author's original words and locks them. Magazine is that bound issue — a readable sheet, not a restyle of a URL list. Cards open that page. People read on the site: one floating paper sheet at a time on a binding-cloth stage (cover, then contents, then the sequence). Contents rows open that piece on the same sheet. Next turns that same paper sheet. Desktop and mobile share the object. Not a stacked paper webpage. Not a two-page spread. Not a pinch-PDF. App chrome sits on the cloth, not on the paper. Original words are recomposed on the sheet. Body is Source Serif 4 at 16–18px / 1.65–1.7 / 45–75ch. Running head, folio, and kicker are Source Sans 3. Cover and heads use a stronger display cut of the same serif. Two families only. Leftover product lines stay off the sheet, including `Inside ·`. The cover does not print product copy as a kicker. A cover kicker appears only when bind already has a source-owned cover line — not `understanding.topic`, not the take, not an invented dek. A take may sit as unlabeled italic between hairlines. It is optional. It is not a TL;DR kicker. The page still reads if the take is missing. The folio is page numbers, not the raw source URL.

A bound-issue card has quiet Remove, same register as Select. Deleting asks whether to return the pieces to Desk or remove them too. A bound piece is not on Desk until it is returned. Bind takes it off Desk again. The issue list may be empty.

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
