import { describe, expect, it } from "vitest";
import { keepNeedsUrl } from "../src/copy";
import {
  isPublicAddress,
  readCapped,
  readCappedText,
  safeFetch,
  type HostLookup,
} from "../src/lib/safe-fetch";
import { saveClip, type ClipStore } from "../src/lib/save";

const publicLookup: HostLookup = async () => ["93.184.215.14"];

function routed(table: Record<string, string[]>): HostLookup {
  return async (host) => table[host] ?? ["93.184.215.14"];
}

function redirect(to: string, status = 302) {
  return new Response(null, { status, headers: { location: to } });
}

describe("isPublicAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:192.168.1.10",
    "::ffff:c0a8:010a",
    "64:ff9b::10.0.0.1",
    "2001:db8::1",
    "not-an-ip",
  ])("rejects %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["93.184.215.14", "1.1.1.1", "100.128.0.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:1.1.1.1"])(
    "accepts %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe("safeFetch", () => {
  it("fetches a public host", async () => {
    const response = await safeFetch("https://example.com/a", {}, {
      lookup: publicLookup,
      get: async () => new Response("ok"),
    });
    expect(await response.text()).toBe("ok");
  });

  it("rejects a public-looking name that resolves to a private address", async () => {
    let called = false;
    await expect(
      safeFetch("https://evil.example/", {}, {
        lookup: routed({ "evil.example": ["192.168.1.20"] }),
        get: async () => {
          called = true;
          return new Response("x");
        },
      }),
    ).rejects.toThrow(/public address/);
    expect(called).toBe(false);
  });

  it("rejects when any resolved address is private", async () => {
    await expect(
      safeFetch("https://mixed.example/", {}, {
        lookup: routed({ "mixed.example": ["93.184.215.14", "10.0.0.5"] }),
        get: async () => new Response("x"),
      }),
    ).rejects.toThrow(/public address/);
  });

  it("rejects literal private hosts and non-http schemes", async () => {
    const get = async () => new Response("x");
    await expect(safeFetch("http://127.0.0.1/", {}, { lookup: publicLookup, get })).rejects.toThrow();
    await expect(safeFetch("http://[::1]/", {}, { lookup: publicLookup, get })).rejects.toThrow();
    await expect(safeFetch("http://[::ffff:10.0.0.1]/", {}, { lookup: publicLookup, get })).rejects.toThrow();
    await expect(safeFetch("file:///etc/passwd", {}, { lookup: publicLookup, get })).rejects.toThrow();
  });

  it("follows redirects by hand and re-checks every hop", async () => {
    const seen: string[] = [];
    await expect(
      safeFetch("https://example.com/start", {}, {
        lookup: routed({ "router.lan.example": ["192.168.1.1"] }),
        get: async (url, init) => {
          seen.push(url);
          expect(init.redirect).toBe("manual");
          return url.endsWith("/start") ? redirect("https://router.lan.example/admin") : new Response("x");
        },
      }),
    ).rejects.toThrow(/public address/);
    expect(seen).toEqual(["https://example.com/start"]);
  });

  it("follows a public redirect chain", async () => {
    const response = await safeFetch("https://example.com/1", {}, {
      lookup: publicLookup,
      get: async (url) => (url.endsWith("/1") ? redirect("/2", 301) : new Response(url)),
    });
    expect(await response.text()).toBe("https://example.com/2");
  });

  it("stops after too many redirects", async () => {
    await expect(
      safeFetch("https://example.com/loop", {}, {
        lookup: publicLookup,
        get: async () => redirect("/loop"),
      }),
    ).rejects.toThrow(/Too many redirects/);
  });
});

describe("readCapped", () => {
  it("reads a body under the cap", async () => {
    expect(await readCappedText(new Response("hello"), 10)).toBe("hello");
  });

  it("rejects a declared length over the cap", async () => {
    const response = new Response("x", { headers: { "content-length": "999999" } });
    await expect(readCapped(response, 10)).rejects.toThrow(/too large/);
  });

  it("rejects a streamed body over the cap", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i += 1) controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    await expect(readCapped(new Response(stream), 20)).rejects.toThrow(/too large/);
  });
});

describe("Keep URL", () => {
  const store: ClipStore = {
    insert: async (clip) => clip,
    get: async () => null,
    persistUnderstanding: async () => {},
    persistRelated: async () => {},
    persistSourceHeadline: async () => {},
    remove: async () => {},
  };

  it.each([
    "javascript:alert(1)",
    "ftp://example.com/file",
    "not a url",
    "http://localhost:3000/",
    "http://192.168.1.1/",
    `https://example.com/${"a".repeat(2100)}`,
  ])("refuses %s before storing anything", async (url) => {
    let inserted = false;
    await expect(
      saveClip({ url }, { ...store, insert: async (clip) => ((inserted = true), clip) }),
    ).rejects.toThrow(keepNeedsUrl);
    expect(inserted).toBe(false);
  });
});
