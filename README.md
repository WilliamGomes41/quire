# Quire

A personal press for one reader.

Save the links. Bind the issue.

New Quire. Not a patch on quire-bind.

For people who like to keep articles for calm later reading. Paste a URL. It stays.

## This slice

Keep always saves. A clip is written first. Then one Grok understanding (content type, topic, entities, optional date). Grok only structures the topic. It does not search or pick URLs.

Then the More on this topic rail. Retrieval is a provider slot: one dedicated search API behind a function/config. The search API finds pages (raw). The app normalizes, dedupes, ranks, and persists at most five `related_reporting`.

`ok`+0 may tell the reader we looked and found nothing more on this topic. System fail (`failed` / `unconfigured` / timeout) uses different copy. Failed retrieval does not write `related_reporting`. Search failure does not fail Keep.

If understanding fails, Keep still stands and a readable fail is stored. Could-not-understand is not a silent omit. Empty vs fail are persisted and shown.

Canonical law lives in [quire-bind PROTOCOL.md](https://github.com/WilliamGomes41/quire-bind/blob/main/PROTOCOL.md) (v0.8.3). Do not treat this README as PROTOCOL.

## Stack

TanStack Start, Better Auth, PGLite (or Postgres/Neon when `DATABASE_URL` is set), xAI `grok-4.6` for Keep understanding, one dedicated search API in the retrieval slot.

## Develop

```bash
npm install
cp .env.example .env
npm test
npm run dev
```
