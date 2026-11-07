import { describe, test, expect, beforeAll } from 'vitest';
import { createPglite, type Db } from '../src/lib/data/engine';
import { syncConnection } from '../src/lib/integrations/syncService';
import { freshness } from '../src/lib/domain/sync';
import { canvasAdapter } from '../src/lib/integrations/canvas';
import { IDS } from './helpers';

let db: Db;
beforeAll(async () => { db = await createPglite(); });
const snapshot = () => db.asService((q) => q<Record<string, unknown>>(`select id, title, score, submission_status, updated_at from assignments where source = 'canvas' order by id`));
const conn = () => db.asService((q) => q<Record<string, string>>(`select * from integration_connections where id = $1`, [IDS.canvasConn])).then((r) => r[0]);

describe('Expired integrations do not overwrite good data or appear current', () => {
  test('auth failure keeps data + last_success_at, marks Reconnect needed, explains what was not refreshed', async () => {
    const before = await snapshot(); const c0 = await conn();
    let fetched = false;
    const res = await syncConnection(db, IDS.canvasConn, {
      name: 'Canvas', describeScope: () => 'Assignments, scores and course grades for Ava',
      checkAuth: async () => ({ ok: false, reason: 'token expired' }),
      fetchAll: async () => { fetched = true; return null; },
    }, () => [{ courseExternalId: 'demo-c1', courseName: 'WRONG', teacher: null, externalId: 'demo-a1', title: 'OVERWRITTEN', kind: 'assignment', sourceUrl: null,
      dueAt: null, closesAt: null, pointsPossible: 1, score: 0, submissionStatus: 'missing', submittedAt: null, gradedAt: null, attemptsUsed: null, attemptsAllowed: null, attemptsUnlimited: false }]);
    expect(res.outcome).toBe('auth_failed');
    expect(fetched).toBe(false); // auth verified BEFORE fetching
    expect(await snapshot()).toEqual(before);
    const c1 = await conn();
    expect(c1.status).toBe('reconnect_needed');
    expect(new Date(c1.last_success_at).getTime()).toBe(new Date(c0.last_success_at).getTime());
    expect(c1.not_refreshed).toMatch(/were not refreshed/);
    expect(freshness({ status: 'reconnect_needed', lastSuccessAt: new Date(c1.last_success_at), lastAttemptAt: new Date(), lastError: null, notRefreshed: null }, new Date())).toBe('reconnect_needed');
  });

  test('a 401 from Canvas during auth check is treated the same way', async () => {
    const before = await snapshot();
    const fake401 = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const res = await syncConnection(db, IDS.canvasConn, canvasAdapter({ baseUrl: 'https://canvas.example.test', token: 'expired', studentCanvasId: 1, childName: 'Ava', fetchImpl: fake401 }), () => []);
    expect(res.outcome).toBe('auth_failed');
    expect(await snapshot()).toEqual(before);
  });

  test('freshness never reports "current" from an attempt alone', () => {
    const now = new Date();
    expect(freshness({ status: 'connected', lastSuccessAt: new Date(+now - 30 * 3600_000), lastAttemptAt: now, lastError: null, notRefreshed: null }, now)).toBe('stale');
    expect(freshness({ status: 'connected', lastSuccessAt: null, lastAttemptAt: now, lastError: null, notRefreshed: null }, now)).toBe('never_synced');
  });
});
