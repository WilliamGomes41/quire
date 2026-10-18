/**
 * Server-side fetch for URLs a reader or a source page supplied.
 * Public hosts only: every hop's DNS answers are checked, redirects are
 * followed by hand, and bodies are read up to a cap.
 */

// Namespace imports: article.ts (and so this file) is also in the client graph,
// where these are never called but named imports would fail the browser build.
import * as dns from "node:dns/promises";
import * as net from "node:net";
import { isPublicHttpUrl } from "./article";

export const SAFE_FETCH_MAX_REDIRECTS = 3;
export const HTML_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export type HostLookup = (host: string) => Promise<string[]>;

const defaultLookup: HostLookup = async (host) =>
  (await dns.lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

function ipv4Parts(address: string) {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function isPublicIpv4(address: string) {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT / Tailscale
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0];
  const tailV4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tailV4) {
    const parts = ipv4Parts(tailV4[1]);
    if (!parts) return null;
    text =
      text.slice(0, -tailV4[1].length) +
      `${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = text.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  const groups = [...headParts, ...Array(fill).fill("0"), ...tailParts].map((group) =>
    Number.parseInt(group, 16),
  );
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
}

function isPublicIpv6(address: string) {
  const g = expandIpv6(address);
  if (!g) return false;
  if (g.every((group) => group === 0)) return false; // ::
  if (g.slice(0, 7).every((group) => group === 0) && g[7] === 1) return false; // ::1
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  if (g.slice(0, 5).every((group) => group === 0) && g[5] === 0xffff) return isPublicIpv4(embeddedV4()); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicIpv4(embeddedV4()); // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

/** True only for an address on the public internet. */
export function isPublicAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

async function assertPublicTarget(url: URL, lookup: HostLookup) {
  if (!isPublicHttpUrl(url.href)) throw new Error("Not a public http(s) URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : await lookup(host);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Error("URL does not resolve to a public address.");
  }
}

export type SafeFetchOptions = {
  get?: (url: string, init: RequestInit) => Promise<Response>;
  lookup?: HostLookup;
  maxRedirects?: number;
};

/**
 * fetch() for untrusted URLs. Rejects non-public targets on every hop.
 * DNS is checked before connecting; a resolver that changes its answer
 * between the check and the connect is not covered.
 */
export async function safeFetch(
  input: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const get = options.get ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const maxRedirects = options.maxRedirects ?? SAFE_FETCH_MAX_REDIRECTS;
  let url = new URL(input);
  for (let hop = 0; ; hop += 1) {
    await assertPublicTarget(url, lookup);
    const response = await get(url.href, { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    if (hop >= maxRedirects) throw new Error("Too many redirects.");
    await response.body?.cancel();
    url = new URL(location, url);
  }
}

/** Read a response body up to maxBytes. Larger bodies are rejected, not truncated. */
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response is too large.");
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Response is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readCappedText(response: Response, maxBytes = HTML_MAX_BYTES) {
  return new TextDecoder().decode(await readCapped(response, maxBytes));
}
