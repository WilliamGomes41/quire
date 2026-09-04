/**
 * Runtime server env. Dynamic key so Vite/esbuild cannot replace the read at build.
 * Provider credentials stay server-side. PROTOCOL §11.
 */
export function serverEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
