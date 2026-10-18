import { auth, authReady } from "./auth";

/**
 * Owner gate in front of the whole app (see src/start.ts). Keep, Select,
 * and bind stay unaware of who is reading; this only decides whether the
 * request gets through.
 */

/** Paths a signed-out visitor may reach: the sign-in page and its API. */
export function isOpenPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/api/auth/");
}

/** Owner session for these headers, or null. */
export async function ownerSession(headers: Headers) {
  await authReady();
  return auth.api.getSession({ headers });
}

/** null lets the request through; otherwise the response to send instead. */
export async function ownerGate(
  request: Request,
  pathname: string,
  handlerType: "serverFn" | "router",
): Promise<Response | null> {
  if (isOpenPath(pathname)) return null;
  if (await ownerSession(request.headers)) return null;
  if (handlerType === "serverFn") {
    return new Response("Sign in to use Quire.", { status: 401 });
  }
  return new Response(null, { status: 302, headers: { location: "/login" } });
}
