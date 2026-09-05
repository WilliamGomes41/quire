# Quire

A personal press for one reader.

Save the links. Bind the issue.

New Quire. Not a patch on quire-bind.

For people who like to keep articles for calm later reading. Paste a URL. It stays.

## This slice

Keep always saves. A clip is written first. Then one Grok understanding grounded in source text (headline, snippet/description, cleaned body ~8–15k): content type, topic, entities, optional date, `centralClaim`, and up to two `supportingClaims`. URL-only is insufficient for claims. Grok only structures. It does not search or pick URLs. Missing or limited claims still leave the clip saved.

Then the More on this topic rail. Relevance is claim-first. Grok structures two short search strings from the central claim (entities as context only). It does not search, pick URLs, or invent related pages. If claims failed or are limited, the rail stays empty or small — not an entity-first junk fill. Retrieval is a provider slot: one dedicated search API behind a function/config. That API (Brave) runs both queries (~40 raw). If Grok does not produce the two strings, the rail falls back to a claim query, not topic+entities. The app normalizes (Wikipedia hosts — any language or mobile `*.wikipedia.org` — are dropped), dedupes, cheap-preselects ~12 by claim tokens, then one bounded Grok judge (relevance `direct|contextual|irrelevant|uncertain`, optional stance `comparable|contrarian|inconclusive`). Irrelevant drops. Persist at most five `related_reporting` with stance when judged. Fewer results beat junk. Zero good hits after the filter is `ok`+0 (`nothingMoreOnTopic`), not fail. Wikipedia must never appear on More on this topic. Stance labels: Other reporting / A contrasting angle / Could not place. Absent rows are deterministic after labels, never a Grok URL.

Keep and Select are a desk on paper `#FAF7F1`. A modest Source Serif site masthead sits above the desk. Keep paste is the left rail — one paste, not a form stack. Select is the keep board on the right. The tile heading is the stored source headline when Keep could read one, in Source Serif at board scale — not the Read cover display. A stored source figure leads that card when Keep already has one; a keep without a figure stays type-led. No invented photos or sample copy. Host and topic stay secondary. Source is the leaving control. A source-owned snippet sits under the headline. Photographs contain. Remove takes a clip off the pile. Related stay collapsed as More on this topic + tally; selected stay visible. The Select board is a two-column paper pile on a wide viewport, with one Create issue for the board. Empty selection does not bind. The board is not a dark stage and not a floating sheet — those stay on Read.

Then Select → Create issue → Read. An issue is whatever you choose to bind. The kept piece is in unless you take it out. Related reporting joins only when you select it. Suggestions stay suggestions until then.

Create issue fetches the author's original words and locks them. Magazine is that bound issue — a readable sheet, not a restyle of a URL list. Cards open that page. People read on the site: one floating paper sheet at a time on a binding-cloth stage (cover, then contents, then the sequence). Contents rows open that piece on the same sheet. Next turns that same paper sheet. Desktop and mobile share the object. Not a stacked paper webpage. Not a two-page spread. Not a pinch-PDF. App chrome sits on the cloth, not on the paper. **Print this issue** sits in that stage chrome — not a filled pill on the paper, not a Press tab, not a `/press` route. Press is the library of bound issues on the home board, a snapshot you return to. Covers reopen the same magazine sheet at `/read/$id`. Empty Press is an empty library, not a fail. Print prints the same bound sequence and Design Intent on A4 or letter. The compositor is internal. Original words are recomposed on the sheet. Body is Source Serif 4 at 16–18px / 1.65–1.7 / 45–75ch. Running head, folio, and kicker are Source Sans 3. Cover and heads use a stronger display cut of the same serif. Two families only. Leftover product lines stay off the sheet, including `Inside ·`. The cover does not print product copy as a kicker. A cover kicker appears only when bind already has a source-owned cover line — not `understanding.topic`, not the take, not an invented dek. A take may sit as unlabeled italic between hairlines. It is optional. It is not a TL;DR kicker. The page still reads if the take is missing. The folio is page numbers, not the raw source URL.

A bound-issue card has quiet Remove, same register as Select. Deleting asks whether to return the pieces to Desk or remove them too. A bound piece is not on Desk until it is returned. Bind takes it off Desk again. The issue list may be empty.

Search failure, understanding failure, a failed take, or a failed bind do not fail Keep.

Canonical law lives in [quire-bind PROTOCOL.md @ 3fa358c](https://github.com/WilliamGomes41/quire-bind/blob/3fa358c/PROTOCOL.md) (v0.8.3 living, claim-first). Stance meanings: [f96b051](https://github.com/WilliamGomes41/quire-bind/blob/f96b051/PROTOCOL.md). Do not treat this README as PROTOCOL.

## Stack

TanStack Start, Better Auth, PGLite (or Postgres/Neon when `DATABASE_URL` is set), xAI `grok-4.6` for Keep understanding, two related search strings, one rail judge, and the optional take, one dedicated search API in the retrieval slot.

## Develop

```bash
npm install
cp .env.example .env
npm test
npm run dev
```
