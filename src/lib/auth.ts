import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getMigrations } from "better-auth/db/migration";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";
import { serverEnv } from "./server-env";

/**
 * One reader. Sign-up is closed; the owner is seeded from OWNER_EMAIL /
 * OWNER_PASSWORD on first start. Users and sessions live in DATABASE_URL
 * when set, else in memory (dev only — gone on restart).
 */

const production = process.env.NODE_ENV === "production";
const devSecret = "quire-dev-secret-change-me";
export const OWNER_PASSWORD_MIN = 12;

function authSecret() {
  const secret = serverEnv("BETTER_AUTH_SECRET");
  if (secret) return secret;
  if (production) {
    throw new Error("BETTER_AUTH_SECRET is required in production (32+ random characters).");
  }
  return devSecret;
}

const databaseUrl = serverEnv("DATABASE_URL");

/** Client-IP header(s) set by a trusted proxy (e.g. cf-connecting-ip), for sign-in rate limits. */
const ipAddressHeaders = (serverEnv("AUTH_IP_HEADERS") ?? "")
  .split(",")
  .map((header) => header.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  secret: authSecret(),
  baseURL: serverEnv("BETTER_AUTH_URL") ?? "http://localhost:3000",
  database: databaseUrl
    ? new Pool({ connectionString: databaseUrl, max: 3 })
    : memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  ...(ipAddressHeaders.length ? { advanced: { ipAddress: { ipAddressHeaders } } } : {}),
  plugins: [tanstackStartCookies()],
});

let ready: Promise<void> | null = null;

/** Auth tables exist and the owner is seeded. Once per process. */
export function authReady(): Promise<void> {
  if (!ready) {
    ready = prepare().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function prepare() {
  if (databaseUrl) {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  }
  await seedOwner();
}

/** Creates the owner when there are no users yet. Never overwrites an existing account. */
async function seedOwner() {
  const email = serverEnv("OWNER_EMAIL")?.toLowerCase();
  const password = serverEnv("OWNER_PASSWORD");
  if (!email || !password) return;
  const ctx = await auth.$context;
  if ((await ctx.internalAdapter.countTotalUsers()) > 0) return;
  if (password.length < OWNER_PASSWORD_MIN) {
    throw new Error(`OWNER_PASSWORD must be at least ${OWNER_PASSWORD_MIN} characters.`);
  }
  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: serverEnv("OWNER_NAME") ?? "Owner",
      emailVerified: true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
}
