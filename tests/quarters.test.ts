import { describe, it, expect } from 'vitest';
import { quarterFor, withInferredPeriods, previousQuarter, currentPeriod, inReminderScope } from '../src/lib/domain/assignments';
import type { GradingPeriod, Assignment } from '../src/lib/domain/types';

const Q: GradingPeriod[] = [
  { id: 'q1', name: 'Q1', kind: 'quarter', startsOn: '2026-08-11', endsOn: '2026-10-09' },
  { id: 'q2', name: 'Q2', kind: 'quarter', startsOn: '2026-10-13', endsOn: '2026-12-18' },
  { id: 'q3', name: 'Q3', kind: 'quarter', startsOn: '2027-01-04', endsOn: '2027-03-11' },
];
const tz = 'America/New_York';
const a = (id: string, due: string | null, periodId: string | null = null) =>
  ({ id, dueAt: due ? new Date(due) : null, periodId } as unknown as Assignment);

describe('quarters', () => {
  it('maps a due date to its quarter, break days to the quarter that just ended', () => {
    expect(quarterFor(new Date('2026-09-15T15:00:00Z'), Q, tz)?.id).toBe('q1');
    expect(quarterFor(new Date('2026-10-12T15:00:00Z'), Q, tz)?.id).toBe('q1');
    expect(quarterFor(new Date('2026-10-14T03:59:00Z'), Q, tz)?.id).toBe('q2'); // 11:59pm Oct 13 local
    expect(quarterFor(new Date('2026-07-01T15:00:00Z'), Q, tz)).toBeNull();
  });
  it('keeps an existing period and never invents one for undated work', () => {
    const [x, y, z] = withInferredPeriods([a('x', '2026-09-01T12:00:00Z', 'q2'), a('y', '2026-09-01T12:00:00Z'), a('z', null)], Q, tz);
    expect([x.periodId, y.periodId, z.periodId]).toEqual(['q2', 'q1', null]);
  });
  it('current and previous quarter, including during a break', () => {
    expect(currentPeriod(Q, new Date('2026-11-08T15:00:00Z'), tz)?.id).toBe('q2');
    expect(currentPeriod(Q, new Date('2026-12-28T15:00:00Z'), tz)?.id).toBe('q2');
    expect(previousQuarter(Q, Q[1])?.id).toBe('q1');
    expect(previousQuarter(Q, Q[0])).toBeNull();
  });
  it('last-quarter work is not in reminder scope', () => {
    const scope = { excluded: new Set<string>(), included: new Set<string>(), current: Q[1] };
    const [old, now] = withInferredPeriods([a('o', '2026-09-20T15:00:00Z'), a('n', '2026-11-10T15:00:00Z')], Q, tz);
    expect(inReminderScope(old, scope)).toBe(false);
    expect(inReminderScope(now, scope)).toBe(true);
  });
});

import { weightedPct } from '../src/lib/view';
describe('weightedPct', () => {
  it('matches the Canvas screenshot: 74% formative (30), 77.5% summative (50), 86.79% classwork (20) = 78.31%', () => {
    const a = (g: string, w: number, s: number, p: number) => ({ groupName: g, groupWeight: w, score: s, pointsPossible: p });
    const pct = weightedPct([a('Formative', 30, 74, 100), a('Summative', 50, 232.5, 300), a('Classwork', 20, 94.6, 109)]);
    expect(Math.round(pct! * 10000) / 100).toBe(78.31);
  });
  it('falls back to points when not weighted', () => {
    expect(weightedPct([{ groupName: null, groupWeight: null, score: 8, pointsPossible: 10 }])).toBe(0.8);
  });
});
