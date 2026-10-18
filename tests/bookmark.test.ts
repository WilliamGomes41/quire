import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockMatches, blockStart, bookmarkStore, resumeSheet } from "../src/lib/bookmark";
import { openDb, resetMemoryDb } from "../src/lib/db";
import { clipStore, issueStore } from "../src/lib/store";

let session: { user: { id: string } } | null = null;
let sessionFails = false;
const requestHeaders = new Headers({ cookie: "from-request" });
const seenHeaders: Headers[] = [];

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: requestHeaders }),
}));

vi.mock("../src/lib/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        seenHeaders.push(headers);
        if (sessionFails) throw new Error("no auth tables yet");
        return session;
      },
    },
  },
}));

const { currentReaderId, singleReader } = await import("../src/lib/reader");

const top = (sheet: number) => ({ sheet, block: null, start: null });

afterEach(() => {
  resetMemoryDb();
  session = null;
  sessionFails = false;
  seenHeaders.length = 0;
});

describe("bookmarks", () => {
  it("keeps the sheet a reader last turned to, one row per reader and item", async () => {
    const store = await bookmarkStore();
    expect(await store.get("ada", "issue-1")).toBeNull();
    await store.set("ada", "issue-1", top(2));
    await store.set("ada", "issue-1", top(4));
    await store.set("ben", "issue-1", top(1));
    expect((await store.get("ada", "issue-1"))?.sheet).toBe(4);
    expect((await store.get("ben", "issue-1"))?.sheet).toBe(1);
    const db = await openDb();
    const { rows } = await db.query("select count(*)::int as n from bookmarks");
    expect(rows[0]?.n).toBe(2);
  });

  it("keeps the paragraph and its opening words, and clears them on a new sheet", async () => {
    const store = await bookmarkStore();
    await store.set("ada", "issue-1", {
      sheet: 3,
      block: 5,
      start: "  Eleven volunteers share the work.   Most are retired and two are students. ",
    });
    expect(await store.get("ada", "issue-1")).toMatchObject({
      sheet: 3,
      block: 5,
      start: "Eleven volunteers share the work. Most are retired",
    });
    await store.set("ada", "issue-1", top(4));
    expect(await store.get("ada", "issue-1")).toMatchObject({ sheet: 4, block: null, start: null });
  });

  it("stores whole, non-negative places", async () => {
    const store = await bookmarkStore();
    expect((await store.set("ada", "issue-1", top(2.7))).sheet).toBe(2);
    expect((await store.set("ada", "issue-1", top(-3))).sheet).toBe(0);
    expect(await store.set("ada", "issue-1", { sheet: 2, block: -1, start: "Words" })).toMatchObject({
      block: null,
      start: null,
    });
  });

  it("drops an item's bookmarks when the issue or the kept piece goes", async () => {
    const bookmarks = await bookmarkStore();
    const issues = await issueStore();
    const clips = await clipStore();
    await issues.insert({
      id: "issue-1",
      createdAt: new Date().toISOString(),
      title: "Bound",
      leadUrl: "https://example.com/a",
      take: null,
      pieces: [],
    });
    await clips.insert({
      id: "clip-1",
      url: "https://example.com/b",
      savedAt: new Date().toISOString(),
      understanding: null,
      relatedRail: null,
      relatedReporting: null,
      sourceHeadline: null,
    });
    await bookmarks.set("ada", "issue-1", top(3));
    await bookmarks.set("ada", "clip-1", top(2));
    await issues.remove("issue-1");
    await clips.remove("clip-1");
    expect(await bookmarks.get("ada", "issue-1")).toBeNull();
    expect(await bookmarks.get("ada", "clip-1")).toBeNull();
  });

  it("offers a sheet past the cover that is still in the issue", () => {
    expect(resumeSheet(null, 5)).toBeNull();
    expect(resumeSheet({ sheet: 0 }, 5)).toBeNull();
    expect(resumeSheet({ sheet: 3 }, 5)).toBe(3);
    expect(resumeSheet({ sheet: 5 }, 5)).toBeNull();
    expect(resumeSheet({ sheet: Number.NaN }, 5)).toBeNull();
  });

  it("only scrolls back to a paragraph that still opens with the saved words", () => {
    const saved = blockStart("Eleven volunteers share the work. Most are retired. Two are students.");
    expect(blockMatches("Eleven volunteers share the work.  Most are retired. Two are students.", saved)).toBe(true);
    expect(blockMatches("The cost is small: card stock and ribbons.", saved)).toBe(false);
    expect(blockMatches("Eleven volunteers share the work.", null)).toBe(false);
  });
});

describe("current reader", () => {
  it("is the signed-in user, from this request's headers", async () => {
    session = { user: { id: "user-42" } };
    expect(await currentReaderId()).toBe("user-42");
    expect(seenHeaders[0]).toBe(requestHeaders);
  });

  it("is the single reader when nobody is signed in or auth is unavailable", async () => {
    expect(await currentReaderId()).toBe(singleReader);
    sessionFails = true;
    expect(await currentReaderId()).toBe(singleReader);
  });

  it("is not part of Keep or bind", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).not.toMatch(/currentReaderId|bookmark/);
  });
});

describe("Read surface", () => {
  it("saves the place in order, tracks the top paragraph, and offers to continue", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(read).toMatch(/saving\.current\.then\(\(\) =>\s*saveBookmark\(/);
    expect(read).toMatch(/queueSave\(\{ sheet: next, block: null, start: null \}\)/);
    expect(read).toMatch(/data-block=\{index\}/);
    expect(read).toMatch(/blockMatches\(/);
    expect(read).toMatch(/resumeSheet\(/);
    expect(read).toMatch(/continueReadingLabel\(/);
  });

  it("takes its browser helpers from place.ts, which never touches the database", () => {
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const place = readFileSync("src/lib/place.ts", "utf8");
    expect(read).toMatch(/import \{ bookmarkStore \} from "\.\.\/lib\/bookmark";/);
    expect(read).toMatch(/from "\.\.\/lib\/place";/);
    expect(place).not.toMatch(/^import /m);
  });
});
