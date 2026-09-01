# Quire

A personal press for one reader.

Save the links. Bind the issue.

New Quire. Not a patch on quire-bind.

For people who like to keep articles for calm later reading. Paste a URL. It stays.

## This slice

Keep always saves. A clip is written first. Grok, search, and other enrichment may fail; the keep does not.

Local clips persist in `.pglite` when `DATABASE_URL` is unset. Owner sign-in is required to keep or list. The pile stays with the owner.

Canonical law lives in [quire-bind PROTOCOL.md](https://github.com/WilliamGomes41/quire-bind/blob/main/PROTOCOL.md) (v0.8.3). Do not treat this README as PROTOCOL.

## Stack

TanStack Start, Better Auth, PGLite (or Postgres/Neon when `DATABASE_URL` is set), xAI `grok-4.6` pinned for later understanding.

## Develop

```bash
npm install
cp .env.example .env
npm test
npm run dev
```
