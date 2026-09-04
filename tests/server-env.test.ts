import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { resetMemoryDb } from "../src/lib/db";
import { serverEnv } from "../src/lib/server-env";
import { saveClip } from "../src/lib/save";
import { clipStore } from "../src/lib/store";
import { pagesFromSearchApi } from "../src/lib/search";
import { runGrokUnderstanding } from "../src/lib/understanding";

const envHelper = "src/lib/server-env.ts";
const runtimeReaders = [
  "src/lib/understanding.ts",
  "src/lib/related-queries.ts",
  "src/lib/take.ts",
  "src/lib/search.ts",
  "src/lib/model.ts",
];
const staticEnvKeys = [
  "XAI_API_KEY",
  "SEARCH_API_KEY",
  "SEARCH_API_URL",
  "SEARCH_PROVIDER",
  "XAI_MODEL",
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

afterEach(() => {
  resetMemoryDb();
  delete process.env.XAI_API_KEY;
  delete process.env.SEARCH_API_KEY;
  delete process.env.SEARCH_API_URL;
  delete process.env.SEARCH_PROVIDER;
  delete process.env.XAI_MODEL;
  delete process.env.BRAVE_SEARCH_API_KEY;
});

describe("server env is read at runtime", () => {
  it("uses dynamic process.env[name] so Vite/esbuild cannot replace the key at build", () => {
    const helper = readFileSync(envHelper, "utf8");
    expect(helper).toMatch(/process\.env\[name\]/);
    expect(helper).not.toMatch(/process\.env\.(XAI_|SEARCH_)/);
    for (const key of staticEnvKeys) {
      expect(helper).not.toContain(`process.env.${key}`);
      expect(helper).not.toContain(`process.env["${key}"]`);
      expect(helper).not.toContain(`process.env['${key}']`);
    }
  });

  it("proves static process.env.XAI_API_KEY is replaced and the helper is not", async () => {
    const define = { "process.env.XAI_API_KEY": "undefined" };
    const staticAccess = await esbuild.transform("export const v = process.env.XAI_API_KEY", {
      loader: "js",
      define,
    });
    const literalBracket = await esbuild.transform(
      'export const v = process.env["XAI_API_KEY"]',
      { loader: "js", define },
    );
    const helper = await esbuild.transform(readFileSync(envHelper, "utf8"), {
      loader: "ts",
      define,
    });

    expect(staticAccess.code).toMatch(/void 0|undefined/);
    expect(staticAccess.code).not.toMatch(/process\.env/);
    expect(literalBracket.code).toMatch(/void 0|undefined/);
    expect(helper.code).toMatch(/process\.env\[name\]/);
    expect(helper.code).not.toMatch(/process\.env\.XAI_API_KEY/);
  });

  it("reads a value that was not present when the module loaded", () => {
    expect(serverEnv("XAI_API_KEY")).toBeUndefined();
    process.env.XAI_API_KEY = " runtime-only-test-key ";
    expect(serverEnv("XAI_API_KEY")).toBe("runtime-only-test-key");
  });

  it("treats blank strings as unset", () => {
    process.env.XAI_API_KEY = "   ";
    expect(serverEnv("XAI_API_KEY")).toBeUndefined();
  });
});

describe("static process.env.KEY access is gone from Grok and search readers", () => {
  it("routes XAI and SEARCH reads through serverEnv", () => {
    for (const path of runtimeReaders) {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/serverEnv\(/);
      for (const key of staticEnvKeys) {
        expect(source).not.toContain(`process.env.${key}`);
        expect(source).not.toContain(`process.env["${key}"]`);
        expect(source).not.toContain(`process.env['${key}']`);
      }
    }
    expect(readFileSync("src/lib/search.ts", "utf8")).toMatch(/serverEnv\("BRAVE_SEARCH_API_KEY"\)/);
  });
});

describe("Keep still saves when keys are missing", () => {
  it("persists the clip and a visible understanding fail", async () => {
    const store = await clipStore();
    const clip = await saveClip(
      { url: "https://example.com/runtime-env-keep" },
      store,
      {
        readHeadline: async () => ({ text: "" }),
        searchPages: async () => [],
      },
    );
    const stored = await store.get(clip.id);
    expect(stored?.url).toBe("https://example.com/runtime-env-keep");
    expect(stored?.understanding).toMatchObject({
      status: "failed",
      message: "XAI_API_KEY is not set",
    });
  });
});

describe("Grok and search read the helper at call time", () => {
  it("posts with XAI_API_KEY from process.env when deps.apiKey is omitted", async () => {
    process.env.XAI_API_KEY = "test-key";
    let auth = "";
    const understood = await runGrokUnderstanding(
      { url: "https://example.com/study" },
      {
        post: async (_url, init) => {
          auth = init.headers.Authorization;
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      contentType: "Study",
                      topic: "A paper",
                      entities: ["WHO"],
                      date: null,
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          );
        },
      },
    );
    expect(auth).toBe("Bearer test-key");
    expect(understood.topic).toBe("A paper");
  });

  it("sends SEARCH_API_KEY from process.env when config.apiKey is omitted", async () => {
    process.env.SEARCH_API_KEY = "test-key";
    let token = "";
    const searchPages = pagesFromSearchApi({
      apiUrl: "https://search.example/web",
      get: async (_url, init) => {
        const headers = init && typeof init === "object" && "headers" in init ? init.headers : {};
        token = (headers as { "X-Subscription-Token"?: string })["X-Subscription-Token"] ?? "";
        return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 });
      },
    });
    await searchPages({ query: "harbour" });
    expect(token).toBe("test-key");
  });
});

describe("no secrets in source", () => {
  it("does not commit API key values", () => {
    const files = [...walk("src"), ...walk("tests"), ".env.example"];
    for (const path of files) {
      if (!/\.(ts|tsx|css|json|example)$/.test(path) && path !== ".env.example") continue;
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\bxai-[A-Za-z0-9]/i);
      expect(source).not.toMatch(/\bsk[-_]live[-_]/i);
      expect(source).not.toMatch(/Bearer [A-Za-z0-9_-]{20,}/);
    }
    const example = readFileSync(".env.example", "utf8");
    expect(example).toMatch(/^XAI_API_KEY=$/m);
    expect(example).toMatch(/^SEARCH_API_KEY=$/m);
  });
});
