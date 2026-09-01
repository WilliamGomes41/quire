import { PGlite } from "@electric-sql/pglite";

export type Queryable = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

const schema = `
create table if not exists clips (
  id text primary key,
  owner_id text not null,
  url text not null,
  saved_at timestamptz not null
);
`;

let pglite: PGlite | null = null;
let postgresHandle: Queryable | null = null;

export function pgliteDataDir(env: NodeJS.Dict<string> = process.env) {
  if (env.VITEST) return undefined;
  return env.PGLITE_DATA_DIR ?? ".pglite";
}

async function applySchema(db: Queryable) {
  await db.query(schema);
}

async function connectPostgres(url: string): Promise<Queryable> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  const queryable: Queryable = {
    async query(text, params = []) {
      const rows = (await sql.unsafe(text, params as never[])) as unknown as Record<
        string,
        unknown
      >[];
      return { rows };
    },
  };
  await applySchema(queryable);
  return queryable;
}

async function openPglite(): Promise<Queryable> {
  if (!pglite) {
    const dir = pgliteDataDir();
    pglite = dir ? new PGlite(dir) : new PGlite();
    await pglite.waitReady;
    await pglite.exec(schema);
  }
  return {
    async query(text, params = []) {
      const result = await pglite!.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    },
  };
}

export async function openDb(): Promise<Queryable> {
  const url = process.env.DATABASE_URL;
  if (url) {
    if (!postgresHandle) {
      postgresHandle = await connectPostgres(url);
    }
    return postgresHandle;
  }
  return openPglite();
}

export function resetMemoryDb() {
  pglite = null;
  postgresHandle = null;
}
