import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("PR 1 surface", () => {
  it("does not ship a user-facing Press route or nav", () => {
    const files = walk("src/routes");
    const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(text.includes("Press")).toBe(false);
    expect(text.includes("/press")).toBe(false);
  });
});
