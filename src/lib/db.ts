import type { PGlite } from "@electric-sql/pglite";

export type Queryable = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

const createClips = `
create table if not exists clips (
  id text primary key,
  url text not null,
  saved_at timestamptz not null,
  understanding jsonb
);
`;

const addUnderstanding = `
alter table clips add column if not exists understanding jsonb;
`;

const addRelatedRail = `
alter table clips add column if not exists related_rail jsonb;
`;

const addRelatedReporting = `
alter table clips add column if not exists related_reporting jsonb;
`;

const addSourceHeadline = `
alter table clips add column if not exists source_headline jsonb;
`;

const createIssues = `
create table if not exists issues (
  id text primary key,
  created_at timestamptz not null,
  title text not null,
  lead_url text not null,
  take jsonb,
  pieces jsonb not null
);
`;

const createBookmarks = `
create table if not exists bookmarks (
  reader_id text not null,
  item_id text not null,
  sheet integer not null,
  block integer,
  block_start text,
  saved_at timestamptz not null,
  primary key (reader_id, item_id)
);
`;

const schema = [
  createClips,
  addUnderstanding,
  addRelatedRail,
  addRelatedReporting,
  addSourceHeadline,
  createIssues,
  createBookmarks,
];

/** Postgres pool size. One reader; a few connections cover the parallel loads. */
const poolMax = 5;

let memory: PGlite | null = null;
let opening: Promise<Queryable> | null = null;

/**
 * One client per process, schema applied once.
 * Postgres/Neon when DATABASE_URL is set, else in-memory PGLite.
 */
export function openDb(): Promise<Queryable> {
  if (!opening) {
    opening = connect().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

async function connect(): Promise<Queryable> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { max: poolMax, onnotice: () => {} });
    const queryable: Queryable = {
      async query(text, params = []) {
        const rows = (await sql.unsafe(text, params as never[])) as unknown as Record<
          string,
          unknown
        >[];
        return { rows };
      },
    };
    for (const statement of schema) {
      await queryable.query(statement);
    }
    return queryable;
  }

  if (!memory) {
    const { PGlite } = await import("@electric-sql/pglite");
    memory = new PGlite();
    await memory.exec(schema.join(""));
  }
  const db = memory;
  return {
    async query(text, params = []) {
      const result = await db.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    },
  };
}

export function resetMemoryDb() {
  memory = null;
  opening = null;
}
