import { PGlite } from "@electric-sql/pglite";

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

let memory: PGlite | null = null;

export async function openDb(): Promise<Queryable> {
  const url = process.env.DATABASE_URL;
  if (url) {
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
    await queryable.query(createClips);
    await queryable.query(addUnderstanding);
    await queryable.query(addRelatedRail);
    await queryable.query(addRelatedReporting);
    return queryable;
  }

  if (!memory) {
    memory = new PGlite();
    await memory.exec(`${createClips}${addUnderstanding}${addRelatedRail}${addRelatedReporting}`);
  }
  return {
    async query(text, params = []) {
      const result = await memory!.query<Record<string, unknown>>(text, params);
      return { rows: result.rows };
    },
  };
}

export function resetMemoryDb() {
  memory = null;
}
