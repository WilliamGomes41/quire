import { afterEach, describe, expect, it } from "vitest";
import { pagesFromSearchApi, resolveSearchPages } from "../src/lib/search";

afterEach(() => {
  delete process.env.SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
});

describe("dedicated search API slot", () => {
  it("returns raw pages from the configured search API", async () => {
    const searchPages = pagesFromSearchApi({
      apiKey: "test-key",
      apiUrl: "https://search.example/web",
      get: async (url, init) => {
        expect(String(url)).toMatch(/q=harbour/);
        expect(init && typeof init === "object" && "headers" in init ? init.headers : {}).toMatchObject({
          "X-Subscription-Token": "test-key",
        });
        return new Response(
          JSON.stringify({
            web: {
              results: [
                { url: "https://news.example/a", title: "A", description: "One" },
                { url: "https://news.example/b", title: "B", snippet: "Two" },
              ],
            },
          }),
          { status: 200 },
        );
      },
    });

    await expect(searchPages({ query: "harbour vote" })).resolves.toEqual([
      { url: "https://news.example/a", title: "A", snippet: "One" },
      { url: "https://news.example/b", title: "B", snippet: "Two" },
    ]);
  });

  it("marks a missing key as unconfigured, not ok+0", async () => {
    const searchPages = resolveSearchPages({ apiKey: "", api: "search_api" });
    await expect(searchPages({ query: "harbour" })).rejects.toMatchObject({
      status: "unconfigured",
      message: "SEARCH_API_KEY is not set",
    });
  });

  it("marks abort as timeout", async () => {
    const searchPages = pagesFromSearchApi({
      apiKey: "test-key",
      get: async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    });
    await expect(searchPages({ query: "harbour" })).rejects.toMatchObject({
      status: "timeout",
    });
  });
});
