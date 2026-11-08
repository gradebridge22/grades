import { expect, test } from 'vitest';
import { schoolYearStart, isFromPreviousYear, inReminderScope } from '../src/lib/domain/assignments';
import { dueRelative, fmtDate, shortCourse, isOnPaper } from '../src/lib/view';
import type { Assignment } from '../src/lib/domain/types';

const now = new Date('2026-11-08T20:00:00Z');
const a = (dueAt: string | null, id = 'x') => ({ id, dueAt: dueAt ? new Date(dueAt) : null, periodId: null } as unknown as Assignment);

test('school year starts mid-July by default, or at an earlier configured period', () => {
  expect(schoolYearStart(now).toISOString().slice(0, 10)).toBe('2026-07-15');
  expect(schoolYearStart(new Date('2027-03-01T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-07-15');
  expect(schoolYearStart(now, [{ startsOn: '2026-07-10', endsOn: '2026-10-15' }]).toISOString().slice(0, 10)).toBe('2026-07-10');
  expect(schoolYearStart(now, [{ startsOn: '2025-08-10', endsOn: '2025-10-15' }]).toISOString().slice(0, 10)).toBe('2026-07-15');
});

test("last year's leftovers in a reused course are history and never trigger reminders", () => {
  const scope = { excluded: new Set<string>(), included: new Set<string>(), current: null, yearStart: schoolYearStart(now) };
  expect(isFromPreviousYear(a('2026-01-20T12:00:00Z'), scope)).toBe(true);
  expect(inReminderScope(a('2026-01-20T12:00:00Z'), scope)).toBe(false);
  expect(isFromPreviousYear(a('2026-09-20T12:00:00Z'), scope)).toBe(false);
  expect(isFromPreviousYear(a(null), scope)).toBe(false);
  scope.included.add('keep');
  expect(inReminderScope(a('2026-01-20T12:00:00Z', 'keep'), scope)).toBe(true); // parent deliberately brought it back
});

test('readable dates and labels', () => {
  const tz = 'America/New_York';
  expect(dueRelative(a('2026-11-03T16:00:00Z'), tz, now)).toBe('5 days late');
  expect(dueRelative(a('2026-11-09T16:00:00Z'), tz, now)).toBe('due tomorrow');
  expect(fmtDate(new Date('2026-01-20T16:00:00Z'), tz, false, now)).toBe('Jan 20, 2026');
  expect(fmtDate(new Date('2026-11-12T16:00:00Z'), tz, false, now)).toBe('Nov 12');
  expect(shortCourse('M/J Language Arts 3, Advanced - Rodriguez - p01 - s03')).toBe('M/J Language Arts 3, Advanced');
  expect(isOnPaper('CLWK: mots croisés - la nourriture (on paper)')).toBe(true);
  expect(isOnPaper('Vocabulary Quiz ADV 11')).toBe(false);
});
