import { afterEach, describe, expect, it } from "vitest";
import { pgliteDataDir, resetMemoryDb } from "../src/lib/db";
import { saveClip } from "../src/lib/save";
import { clipStore, listClips } from "../src/lib/store";

describe("clip store", () => {
  afterEach(() => {
    resetMemoryDb();
  });

  it("keeps a data directory outside tests so a pasted URL survives restart", () => {
    expect(pgliteDataDir({ PGLITE_DATA_DIR: "/tmp/quire-pg" })).toBe("/tmp/quire-pg");
    expect(pgliteDataDir({})).toBe(".pglite");
    expect(pgliteDataDir({ VITEST: "true" })).toBeUndefined();
  });

  it("does not list another owner's clips", async () => {
    const mine = await clipStore("owner-a");
    await saveClip({ url: "https://example.com/private" }, mine);
    expect(await listClips("owner-b")).toEqual([]);
    expect((await listClips("owner-a")).map((clip) => clip.url)).toEqual([
      "https://example.com/private",
    ]);
  });
});
