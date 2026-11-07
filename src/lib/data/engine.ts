/**
 * Database engine. Two backends, one SQL surface:
 *  - DATABASE_URL set  -> postgres.js against Supabase Postgres (production)
 *  - not set           -> in-process PGlite with migrations + synthetic seed (demo / tests)
 *
 * All user-facing queries go through `asUser`, which switches to the `authenticated` role and sets
 * the JWT subject so Postgres row-level security is enforced exactly as it is in Supabase.
 * `asService` bypasses RLS and is used only by server jobs (sync, notification sender, retention).
 */
import fs from 'node:fs';
import path from 'node:path';

export type Q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
export interface Db {
  asUser<T>(userId: string, fn: (q: Q) => Promise<T>): Promise<T>;
  asService<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  kind: 'pglite' | 'postgres';
}

const root = process.cwd();
function readSql(rel: string) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
export function migrationFiles() {
  const dir = path.join(root, 'supabase/migrations');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/migrations/${f}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function claims(userId: string) {
  if (!UUID_RE.test(userId)) throw new Error('invalid user id');
  return JSON.stringify({ sub: userId, role: 'authenticated' });
}

export async function createPglite(opts: { seed?: boolean; dataDir?: string } = {}): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(opts.dataDir);
  const has = await pg.query<{ ok: boolean }>(`select to_regclass('public.families') is not null as ok`);
  if (!has.rows[0].ok) {
    await pg.exec(readSql('supabase/shim.sql'));
    for (const f of migrationFiles()) await pg.exec(readSql(f));
    if (opts.seed !== false) await pg.exec(readSql('supabase/seed.sql'));
  }
  const wrap = (tx: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Q =>
    (async (sql: string, params?: unknown[]) => (await tx.query(sql, params)).rows) as Q;
  return {
    kind: 'pglite',
    asUser: (userId, fn) =>
      pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims(userId)]);
        await tx.query('set local role authenticated');
        return fn(wrap(tx));
      }),
    asService: (fn) => pg.transaction(async (tx) => fn(wrap(tx))),
  };
}

export async function createPostgres(url: string): Promise<Db> {
  const postgres = (await import('postgres')).default;
  const sql = postgres(url, { max: 5, prepare: false, ssl: url.includes('localhost') ? false : 'require' });
  const wrap = (tx: { unsafe: (s: string, p?: never[]) => Promise<unknown> }): Q =>
    (async (s: string, p?: unknown[]) => (await tx.unsafe(s, (p ?? []) as never[])) as never) as Q;
  return {
    kind: 'postgres',
    asUser: (userId, fn) =>
      sql.begin(async (tx) => {
        await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [claims(userId)]);
        await tx.unsafe('set local role authenticated');
        return fn(wrap(tx as never));
      }) as Promise<never>,
    asService: (fn) => sql.begin(async (tx) => fn(wrap(tx as never))) as Promise<never>,
  };
}

export async function createDb(): Promise<Db> {
  if (process.env.DATABASE_URL) return createPostgres(process.env.DATABASE_URL);
  return createPglite({ dataDir: process.env.PGLITE_DIR || undefined });
}
