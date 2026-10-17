import { afterEach, describe, expect, it } from "vitest";
import { openDb, resetMemoryDb } from "../src/lib/db";

afterEach(() => {
  resetMemoryDb();
});

describe("openDb", () => {
  it("opens one client per process, even under concurrent calls", async () => {
    const [a, b] = await Promise.all([openDb(), openDb()]);
    const c = await openDb();
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("applies the schema before the first query", async () => {
    const db = await openDb();
    const { rows } = await db.query("select count(*)::int as n from clips");
    expect(rows[0]?.n).toBe(0);
  });

  it("opens a fresh store after reset", async () => {
    const first = await openDb();
    await first.query("insert into clips (id, url, saved_at) values ($1, $2, now())", [
      "a",
      "https://example.com/a",
    ]);
    resetMemoryDb();
    const second = await openDb();
    expect(second).not.toBe(first);
    const { rows } = await second.query("select count(*)::int as n from clips");
    expect(rows[0]?.n).toBe(0);
  });
});
