import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Password hashing is deliberately slow.
vi.setConfig({ testTimeout: 30_000 });

const env = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.DATABASE_URL;
  process.env.OWNER_EMAIL = "Owner@Example.com";
  process.env.OWNER_PASSWORD = "a-long-owner-password";
});

afterEach(() => {
  process.env = { ...env };
});

async function load() {
  return import("../src/lib/auth");
}

describe("one-reader auth", () => {
  it("seeds the owner once and lets them sign in", async () => {
    const { auth, authReady } = await load();
    await authReady();
    await authReady();
    const ctx = await auth.$context;
    expect(await ctx.internalAdapter.countTotalUsers()).toBe(1);
    const signedIn = await auth.api.signInEmail({
      body: { email: "owner@example.com", password: "a-long-owner-password" },
    });
    expect(signedIn.token).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    const { auth, authReady } = await load();
    await authReady();
    await expect(
      auth.api.signInEmail({ body: { email: "owner@example.com", password: "wrong-password-123" } }),
    ).rejects.toThrow();
  });

  it("keeps sign-up closed", async () => {
    const { auth, authReady } = await load();
    await authReady();
    await expect(
      auth.api.signUpEmail({
        body: { email: "stranger@example.com", password: "another-long-password", name: "x" },
      }),
    ).rejects.toThrow();
    const ctx = await auth.$context;
    expect(await ctx.internalAdapter.countTotalUsers()).toBe(1);
  });

  it("refuses a short owner password", async () => {
    process.env.OWNER_PASSWORD = "short";
    const { authReady } = await load();
    await expect(authReady()).rejects.toThrow(/at least 12/);
  });

  it("has no session without a cookie", async () => {
    const { ownerSession } = await import("../src/lib/owner");
    expect(await ownerSession(new Headers())).toBeNull();
  });

  it("refuses to start in production without a secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.BETTER_AUTH_SECRET;
    await expect(load()).rejects.toThrow(/BETTER_AUTH_SECRET is required/);
    vi.unstubAllEnvs();
  });
});

describe("owner gate", () => {
  it("lets the sign-in page and its API through without a session", async () => {
    const { ownerGate } = await import("../src/lib/owner");
    const request = new Request("http://quire.test/login");
    expect(await ownerGate(request, "/login", "router")).toBeNull();
    expect(await ownerGate(request, "/api/auth/sign-in/email", "router")).toBeNull();
  });

  it("sends a signed-out page request to /login", async () => {
    const { ownerGate } = await import("../src/lib/owner");
    for (const path of ["/", "/read/abc"]) {
      const response = await ownerGate(new Request(`http://quire.test${path}`), path, "router");
      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe("/login");
    }
  });

  it("refuses a signed-out server function call", async () => {
    const { ownerGate } = await import("../src/lib/owner");
    const response = await ownerGate(new Request("http://quire.test/_serverFn/x"), "/_serverFn/x", "serverFn");
    expect(response?.status).toBe(401);
  });

  it("lets the signed-in owner through", async () => {
    const { auth, authReady } = await load();
    await authReady();
    const { ownerGate } = await import("../src/lib/owner");
    const { headers } = await auth.api.signInEmail({
      body: { email: "owner@example.com", password: "a-long-owner-password" },
      returnHeaders: true,
    });
    const cookie = (headers.get("set-cookie") ?? "").split(";")[0];
    const request = new Request("http://quire.test/", { headers: { cookie } });
    expect(await ownerGate(request, "/", "router")).toBeNull();
  });

  it("closes the gate again after sign-out", async () => {
    const { auth, authReady } = await load();
    await authReady();
    const { ownerGate } = await import("../src/lib/owner");
    const { headers } = await auth.api.signInEmail({
      body: { email: "owner@example.com", password: "a-long-owner-password" },
      returnHeaders: true,
    });
    const cookie = (headers.get("set-cookie") ?? "").split(";")[0];
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    const request = new Request("http://quire.test/", { headers: { cookie } });
    expect((await ownerGate(request, "/", "router"))?.status).toBe(302);
  });

  it("offers sign-out on the desk, not a sign-in link", () => {
    const desk = readFileSync("src/routes/index.tsx", "utf8");
    expect(desk).toMatch(/authClient\.signOut\(\)/);
    expect(desk).toMatch(/\{signOutLabel\}/);
    expect(desk).not.toMatch(/to="\/login"/);
  });

  it("is not looser than a cookie someone made up", async () => {
    const { ownerGate } = await import("../src/lib/owner");
    const request = new Request("http://quire.test/", {
      headers: { cookie: "better-auth.session_token=forged.value" },
    });
    expect((await ownerGate(request, "/", "router"))?.status).toBe(302);
  });
});
