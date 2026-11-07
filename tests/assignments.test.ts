import { describe, test, expect, beforeAll } from 'vitest';
import { classify, inReminderScope, remindersDue, questionsToAsk, type Scope } from '../src/lib/domain/assignments';
import { createPglite, type Db } from '../src/lib/data/engine';
import { getChildData, excludeAssignment } from '../src/lib/data/queries';
import { syncConnection } from '../src/lib/integrations/syncService';
import { mk, IDS } from './helpers';

const now = new Date('2026-11-10T15:00:00Z');
const day = 86400_000;

describe('A submitted assignment is not marked missing', () => {
  test('submitted but ungraded is its own bucket', () => {
    expect(classify(mk({ submissionStatus: 'submitted', submittedAt: new Date(+now - day), dueAt: new Date(+now - 2 * day) }), now)).toBe('submitted_ungraded');
  });
  test('stale missing flag + submitted_at still counts as submitted', () => {
    expect(classify(mk({ submissionStatus: 'missing', submittedAt: new Date(+now - day), dueAt: new Date(+now - 2 * day) }), now)).toBe('submitted_ungraded');
  });
  test('submitted work never produces a reminder or a question', () => {
    const a = mk({ submissionStatus: 'submitted', submittedAt: new Date(+now - day), dueAt: new Date(+now - 2 * day) });
    const scope: Scope = { excluded: new Set(), included: new Set(), current: null };
    expect(remindersDue([a], [], scope, now)).toHaveLength(0);
    expect(questionsToAsk([a], [], scope, now)).toHaveLength(0);
  });
  test('a planner/dashboard checkbox is NOT a submission', () => {
    const a = mk({ plannerChecked: true, submissionStatus: 'not_submitted', dueAt: new Date(+now - day), closesAt: new Date(+now + 3 * day) });
    expect(classify(a, now)).toBe('overdue');
  });
  test('past closing date and unsubmitted is missing; before close it is overdue', () => {
    expect(classify(mk({ dueAt: new Date(+now - 3 * day), closesAt: new Date(+now - day) }), now)).toBe('missing');
    expect(classify(mk({ dueAt: new Date(+now - 3 * day), closesAt: new Date(+now + day) }), now)).toBe('overdue');
  });
});

describe('Previous-quarter exclusions stay excluded', () => {
  const q1 = { id: 'p1', name: 'Q1', kind: 'quarter' as const, startsOn: '2026-08-10', endsOn: '2026-10-16' };
  const q2 = { id: 'p2', name: 'Q2', kind: 'quarter' as const, startsOn: '2026-10-19', endsOn: '2026-12-18' };
  const old = mk({ id: 'old', periodId: q1.id, submissionStatus: 'missing', dueAt: new Date('2026-10-01T12:00:00Z') });
  test('previous-quarter work is out of current reminders by default', () => {
    const scope: Scope = { excluded: new Set(), included: new Set(), current: q2 };
    expect(inReminderScope(old, scope)).toBe(false);
    expect(questionsToAsk([old], [], scope, now)).toHaveLength(0);
  });
  test('a deliberate parent include brings it back', () => {
    expect(inReminderScope(old, { excluded: new Set(), included: new Set(['old']), current: q2 })).toBe(true);
  });
  test('a permanent exclusion beats an include', () => {
    expect(inReminderScope(old, { excluded: new Set(['old']), included: new Set(['old']), current: q2 })).toBe(false);
  });

  let db: Db;
  beforeAll(async () => { db = await createPglite(); });
  test('parent exclusion survives a re-sync that rewrites the assignment', async () => {
    await excludeAssignment(db, IDS.parentA, IDS.osmosis, 'Teacher said lab was cancelled');
    // Simulate a successful sync that re-upserts the same external assignment
    await syncConnection(db, IDS.canvasConn, {
      name: 'fake', describeScope: () => 'x', checkAuth: async () => ({ ok: true }),
      fetchAll: async () => null,
    }, () => [{ courseExternalId: 'demo-c2', courseName: 'Biology', teacher: 'Dr. Sample', externalId: 'demo-a3', title: 'Lab report: Osmosis (updated)',
      kind: 'assignment', sourceUrl: null, dueAt: new Date(+new Date() - 3 * day).toISOString(), closesAt: new Date(+new Date() + 4 * day).toISOString(),
      pointsPossible: 50, score: null, submissionStatus: 'not_submitted', submittedAt: null, gradedAt: null, attemptsUsed: null, attemptsAllowed: null, attemptsUnlimited: false }]);
    const cd = (await getChildData(db, IDS.parentA, IDS.childAva, 'America/New_York'))!;
    const a = cd.assignments.find((x) => x.id === IDS.osmosis)!;
    expect(a.title).toBe('Lab report: Osmosis (updated)');
    expect(cd.scope.excluded.has(IDS.osmosis)).toBe(true);
    expect(remindersDue(cd.assignments, cd.replies, cd.scope, new Date()).map((x) => x.id)).not.toContain(IDS.osmosis);
  });
  test('seeded Q1 project is outside current scope', async () => {
    const cd = (await getChildData(db, IDS.parentA, IDS.childAva, 'America/New_York'))!;
    const q1p = cd.assignments.find((x) => x.id === IDS.q1Project)!;
    expect(inReminderScope(q1p, cd.scope)).toBe(false);
  });
  test('exclusions cannot be deleted by a direct DELETE (permanent)', async () => {
    const del = await db.asUser(IDS.parentA, (q) => q('delete from assignment_exclusions returning *'));
    expect(del).toHaveLength(0);
  });
});
