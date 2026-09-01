import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("PR 4 surface", () => {
  it("does not ship a user-facing Press route or nav", () => {
    const files = walk("src");
    const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(text.includes("/press")).toBe(false);
    const routes = walk("src/routes");
    const routeText = routes.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(routeText).not.toMatch(/\bPress\b/);
    expect(routes.some((file) => file.includes("press"))).toBe(false);
  });

  it("ships Select → Create issue → Read and no Press tab", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    expect(keep).toMatch(/createIssueLabel/);
    expect(keep).toMatch(/includeOriginal/);
    expect(keep).toMatch(/\/read\/\$id/);
    expect(keep).not.toMatch(/web_search/);
    expect(read).toMatch(/composeIssue/);
    expect(read).toMatch(/takeLabel/);
    expect(read).not.toMatch(/TL;DR|tl;dr|Press/);
  });

  it("does not bind Keep to an owner session", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const save = readFileSync("src/lib/save.ts", "utf8");
    const bind = readFileSync("src/lib/bind.ts", "utf8");
    expect(keep).not.toMatch(/getSession|requireOwner|auth\.api/);
    expect(save).not.toMatch(/ownerId|userId/);
    expect(bind).not.toMatch(/ownerId|userId/);
  });

  it("does not map protocol terms to a class tree", () => {
    const text = walk("src/lib")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(text).not.toMatch(/class Understanding/);
    expect(text).not.toMatch(/class KeepUnderstanding/);
    expect(text).not.toMatch(/class SearchProvider/);
    expect(text).not.toMatch(/class Brave/);
    expect(text).not.toMatch(/class RelatedReporting/);
    expect(text).not.toMatch(/class Issue\b/);
    expect(text).not.toMatch(/class ArtDirector/);
    expect(text).not.toMatch(/class Magazine/);
    expect(text).not.toMatch(/class Bind\b/);
  });
});
