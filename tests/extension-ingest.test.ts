import { describe, test, expect, beforeAll } from 'vitest';
import { createPglite, type Db } from '../src/lib/data/engine';
import { redeemPairingCode, ingest, sha256, newPairingCode, type IngestPayload } from '../src/lib/integrations/ingest';
import { getChildData } from '../src/lib/data/queries';
import { IDS } from './helpers';

let db: Db;
async function code(familyId: string, childId: string, by: string, provider: 'canvas' | 'skyward', minutes = 10) {
  const c = newPairingCode();
  await db.asService((q) => q(`insert into extension_pairing_codes(code_hash, family_id, child_id, provider, created_by, expires_at) values ($1,$2,$3,$4,$5, now() + make_interval(mins => $6))`,
    [sha256(c), familyId, childId, provider, by, minutes]));
  return c;
}
const payload = (over: Partial<IngestPayload> = {}): IngestPayload => ({
  provider: 'skyward', extensionVersion: '0.1.0', capturedAt: new Date().toISOString(),
  courses: [{ externalId: 'sky-alg', name: 'Algebra I', teacher: 'Mx. Demo Teacher' }, { externalId: 'sky-pe', name: 'Physical Education', teacher: null }],
  assignments: [{ courseExternalId: 'sky-alg', externalId: 'sky-alg-hw7', title: 'Homework 7', kind: 'assignment', sourceUrl: null,
    dueAt: '2026-11-12', closesAt: null, pointsPossible: 10, score: null, submissionStatus: 'missing', submittedAt: null, gradedAt: null,
    attemptsUsed: null, attemptsAllowed: null, attemptsUnlimited: false }],
  grades: [{ courseExternalId: 'sky-alg', periodLabel: 'Q2', kind: 'quarter', status: 'provisional', percent: 77, letter: 'C+' },
           { courseExternalId: 'sky-alg', periodLabel: 'Q9', kind: 'quarter', status: 'provisional', percent: 50, letter: 'F' }],
  ...over,
});

beforeAll(async () => { db = await createPglite(); });

describe('Browser-extension pairing and ingest', () => {
  test('a code works once, then is dead', async () => {
    const c = await code(IDS.famA, IDS.childAva, IDS.parentA, 'skyward');
    const r = await redeemPairingCode(db, c, 'Chrome on laptop');
    expect(r?.token).toBeTruthy();
    expect(await redeemPairingCode(db, c, 'again')).toBeNull();
  });
  test('expired codes are rejected', async () => {
    const c = await code(IDS.famA, IDS.childAva, IDS.parentA, 'skyward', -1);
    expect(await redeemPairingCode(db, c, 'x')).toBeNull();
  });
  test('only the token hash is stored', async () => {
    const c = await code(IDS.famA, IDS.childAva, IDS.parentA, 'skyward');
    const r = (await redeemPairingCode(db, c, 'x'))!;
    const rows = await db.asService((q) => q<{ token_hash: string }>(`select token_hash from extension_tokens`));
    expect(rows.some((x) => x.token_hash === r.token)).toBe(false);
    expect(rows.some((x) => x.token_hash === sha256(r.token))).toBe(true);
  });
  test('ingest upserts into the paired child only; every course appears; unknown periods are not invented', async () => {
    const c = await code(IDS.famA, IDS.childAva, IDS.parentA, 'skyward');
    const { token } = (await redeemPairingCode(db, c, 'x'))!;
    // Ava has "Quarter 2" configured; "Q2" must match it. "Q9" must NOT create a period.
    const r1 = await ingest(db, token, payload());
    expect(r1).toMatchObject({ ok: true, assignments: 1, grades: 1 });
    if (r1.ok) expect(r1.warnings.join(' ')).toMatch(/Q9/);
    const r2 = await ingest(db, token, payload()); // repeat sync: no duplicates
    expect(r2.ok).toBe(true);
    const cd = (await getChildData(db, IDS.parentA, IDS.childAva, 'America/New_York'))!;
    expect(cd.assignments.filter((a) => a.title === 'Homework 7')).toHaveLength(1);
    expect(cd.courses.some((x) => x.name === 'Physical Education')).toBe(true);
    const periods = await db.asService((q) => q(`select * from grading_periods where name ilike '%9%'`));
    expect(periods).toHaveLength(0);
    // Family B sees none of it
    const b = await db.asUser(IDS.parentB, (q) => q(`select * from assignments where title = 'Homework 7'`));
    expect(b).toHaveLength(0);
  });
  test('a token cannot write as a different provider, and revoked tokens stop working', async () => {
    const c = await code(IDS.famB, IDS.childCory, IDS.parentB, 'canvas');
    const { token } = (await redeemPairingCode(db, c, 'x'))!;
    expect(await ingest(db, token, payload({ provider: 'skyward' }))).toMatchObject({ ok: false, status: 403 });
    await db.asService((q) => q(`update extension_tokens set revoked_at = now() where token_hash = $1`, [sha256(token)]));
    expect(await ingest(db, token, payload({ provider: 'canvas' }))).toMatchObject({ ok: false, status: 401 });
    expect(await ingest(db, 'not-a-real-token-xxxxxxxxxxxxxxx', payload())).toMatchObject({ ok: false, status: 401 });
  });
  test('malformed payloads are rejected (non-https links, oversized lists)', async () => {
    const c = await code(IDS.famA, IDS.childAva, IDS.parentA, 'skyward');
    const { token } = (await redeemPairingCode(db, c, 'x'))!;
    const bad = payload(); bad.assignments[0].sourceUrl = 'javascript:alert(1)';
    expect(await ingest(db, token, bad)).toMatchObject({ ok: false, status: 400 });
    expect(await ingest(db, token, { ...payload(), courses: Array.from({ length: 41 }, (_, i) => ({ externalId: `c${i}`, name: 'x', teacher: null })) })).toMatchObject({ ok: false, status: 400 });
  });
  test('a parent can only create pairing codes for their own family', async () => {
    await expect(db.asUser(IDS.parentB, (q) => q(`insert into extension_pairing_codes(code_hash, family_id, child_id, provider, created_by, expires_at)
      values ('x', $1, $2, 'canvas', $3, now() + interval '10 minutes')`, [IDS.famA, IDS.childAva, IDS.parentB]))).rejects.toThrow(/row-level security/);
    await expect(db.asUser(IDS.ava, (q) => q(`insert into extension_pairing_codes(code_hash, family_id, child_id, provider, created_by, expires_at)
      values ('y', $1, $2, 'canvas', $3, now() + interval '10 minutes')`, [IDS.famA, IDS.childAva, IDS.ava]))).rejects.toThrow(/row-level security/);
  });
});
