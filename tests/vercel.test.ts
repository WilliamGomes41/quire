import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TanStack Start on Vercel", () => {
  it("registers the Nitro Vite adapter so SSR is a Function, not a static Vite site", () => {
    const vite = readFileSync("vite.config.ts", "utf8");
    expect(vite).toMatch(/from ["']nitro\/vite["']/);
    expect(vite).toMatch(/nitro\(\)/);
    expect(vite).not.toMatch(/\bPress\b/);
  });

  it("pins the TanStack Start framework preset", () => {
    expect(existsSync("vercel.json")).toBe(true);
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      framework?: string;
    };
    expect(vercel.framework).toBe("tanstack-start");
    expect(JSON.stringify(vercel)).not.toMatch(/press/i);
  });

  it("depends on nitro for the Vercel Function output", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.nitro ?? pkg.devDependencies?.nitro).toBeTruthy();
  });

  it("does not invent a Press route to make Vercel serve", () => {
    expect(existsSync("src/routes/press.tsx")).toBe(false);
    expect(existsSync("src/routes/press")).toBe(false);
  });
});
