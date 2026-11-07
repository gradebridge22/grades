import { test, expect } from 'vitest';
import { createPglite } from '../src/lib/data/engine';
test('migrations + seed apply', async () => {
  const db = await createPglite();
  const rows = await db.asService((q) => q<{ n: number }>('select count(*)::int n from assignments'));
  expect(rows[0].n).toBeGreaterThan(10);
}, 60000);
