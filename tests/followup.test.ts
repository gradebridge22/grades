import { describe, test, expect } from 'vitest';
import { teacherFollowUps, type Scope } from '../src/lib/domain/assignments';
import { addDelay, nextSchoolDay } from '../src/lib/domain/calendar';
import type { Reply } from '../src/lib/domain/types';
import { mk, cal } from './helpers';

const scope: Scope = { excluded: new Set(), included: new Set(), current: null };
const asg = mk({ id: 'x', submissionStatus: 'submitted', submittedAt: new Date('2026-11-05T12:00:00Z') });
const reply = (at: string): Reply => ({ id: 'r', assignmentId: 'x', status: 'already_did', note: null, channel: 'app', createdAt: new Date(at) });
const hours48 = { value: 48, unit: 'hours' as const };

describe('The 48-hour follow-up rule works across timezones', () => {
  const r = reply('2026-11-06T03:30:00Z'); // Thu 22:30 New York == Thu 19:30 Los Angeles
  for (const tz of ['America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo']) {
    test(`not due at 47h59m, due at 48h — ${tz}`, () => {
      expect(teacherFollowUps([asg], [r], scope, hours48, cal(tz), new Date(+r.createdAt + 48 * 3600_000 - 60_000))).toHaveLength(0);
      expect(teacherFollowUps([asg], [r], scope, hours48, cal(tz), new Date(+r.createdAt + 48 * 3600_000))).toHaveLength(1);
    });
  }
  test('48 real hours across the DST change (Nov 1 2026, US)', () => {
    const before = new Date('2026-10-31T16:00:00Z'); // Sat 12:00 EDT
    expect(addDelay(before, 48, 'hours', cal()).toISOString()).toBe('2026-11-02T16:00:00.000Z'); // Mon 11:00 EST — exactly 48h later
  });
  test('school-days mode uses the FAMILY timezone for the day boundary', () => {
    // Fri 23:30 in Los Angeles is already Saturday in New York / UTC.
    const at = new Date('2026-11-07T07:30:00Z');
    const la = addDelay(at, 2, 'school_days', cal('America/Los_Angeles'));
    expect(la.toISOString()).toBe('2026-11-11T07:30:00.000Z'); // Tue 23:30 PST (Fri -> Mon, Tue)
    const ny = addDelay(at, 2, 'school_days', cal('America/New_York'));
    expect(ny.toISOString()).toBe('2026-11-10T07:30:00.000Z'); // Sat 02:30 EST -> Mon, Tue 02:30 EST
  });
  test('school-days mode skips weekends and holidays', () => {
    const c = { ...cal(), holidays: ['2026-11-09'] };
    const at = new Date('2026-11-06T15:00:00Z'); // Fri 10:00 ET
    expect(addDelay(at, 2, 'school_days', c).toISOString()).toBe('2026-11-11T15:00:00.000Z'); // Mon is a holiday -> Tue 10, Wed 11
  });
  test('verified completion (score) stops the follow-up', () => {
    const graded = { ...asg, score: 9, submissionStatus: 'graded' as const };
    expect(teacherFollowUps([graded], [reply('2026-11-01T00:00:00Z')], scope, hours48, cal(), new Date('2026-11-10T00:00:00Z'))).toHaveLength(0);
  });
  test('next school day after Friday is Monday in family tz', () => {
    expect(nextSchoolDay(new Date('2026-11-06T20:00:00Z'), cal())).toBe('2026-11-09');
  });
});
