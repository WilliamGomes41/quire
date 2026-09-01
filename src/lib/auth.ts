import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { tanstackStartCookies } from "better-auth/tanstack-start";

/**
 * Skeleton only. One-reader Better Auth is wired; Neon/pg Pool
 * can replace the memory adapter when DATABASE_URL is the product DB.
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "quire-dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: memoryAdapter({}),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies()],
});
