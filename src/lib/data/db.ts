import 'server-only';
import { createDb, type Db } from './engine';

// One shared connection per server process.
const g = globalThis as unknown as { __gbDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  if (!g.__gbDb) g.__gbDb = createDb();
  return g.__gbDb;
}
export type { Db, Q } from './engine';
