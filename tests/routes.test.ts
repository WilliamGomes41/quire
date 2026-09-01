import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("PR 3 surface", () => {
  it("does not ship a user-facing Press route or nav", () => {
    const files = walk("src/routes");
    const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(text.includes("Press")).toBe(false);
    expect(text.includes("/press")).toBe(false);
  });

  it("does not bind Keep to an owner session", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const save = readFileSync("src/lib/save.ts", "utf8");
    expect(keep).not.toMatch(/getSession|requireOwner|auth\.api/);
    expect(save).not.toMatch(/ownerId|userId/);
  });

  it("wires one Grok understanding and the search slot on Keep", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    expect(keep).toMatch(/runGrokUnderstanding/);
    expect(keep).toMatch(/understand:/);
    expect(keep).toMatch(/resolveSearchPages/);
    expect(keep).toMatch(/searchPages:/);
    expect(keep).toMatch(/moreOnThisTopic/);
    expect(keep).not.toMatch(/create issue|Create issue|web_search/i);
  });

  it("does not map protocol terms to a class tree", () => {
    const text = [
      "src/lib/understanding.ts",
      "src/lib/save.ts",
      "src/lib/search.ts",
      "src/lib/related.ts",
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(text).not.toMatch(/class Understanding/);
    expect(text).not.toMatch(/class KeepUnderstanding/);
    expect(text).not.toMatch(/class SearchProvider/);
    expect(text).not.toMatch(/class Brave/);
    expect(text).not.toMatch(/class RelatedReporting/);
  });
});
