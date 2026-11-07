import { describe, test, expect } from 'vitest';
import { retakeView, retakeOpportunities, isAdvertisedAsAvailable, attemptsText } from '../src/lib/domain/retakes';
import { mapCanvasAttempts, assertReadOnlyRequest } from '../src/lib/integrations/canvas';
import { mk } from './helpers';
const now = new Date('2026-11-10T15:00:00Z');

describe('A closed quiz is not advertised as an available retake', () => {
  test('explicitly closed', () => {
    const v = retakeView(mk({ kind: 'quiz', score: 5, retakeStatus: 'closed', attemptsUsed: 1, attemptsAllowed: 3 }), now);
    expect(v).toBe('closed'); expect(isAdvertisedAsAvailable(v)).toBe(false);
  });
  test('confirmed window that has since ended is closed', () => {
    const v = retakeView(mk({ kind: 'quiz', score: 5, retakeStatus: 'confirmed_open', retakeClosesAt: new Date(+now - 1000) }), now);
    expect(v).toBe('closed');
  });
  test('all attempts used is closed', () => {
    expect(retakeView(mk({ kind: 'quiz', score: 5, attemptsUsed: 2, attemptsAllowed: 2, retakeStatus: 'unknown' }), now)).toBe('closed');
  });
  test('closed quizzes sort after available ones and are never "available"', () => {
    const ops = retakeOpportunities([
      mk({ id: 'c', kind: 'quiz', score: 4, retakeStatus: 'closed' }),
      mk({ id: 'o', kind: 'quiz', score: 4, retakeStatus: 'confirmed_open', retakeClosesAt: new Date(+now + 86400_000) }),
    ], now);
    expect(ops[0].assignment.id).toBe('o');
    expect(ops.filter((o) => isAdvertisedAsAvailable(o.view)).map((o) => o.assignment.id)).toEqual(['o']);
  });
});

describe('Unknown attempts remain unknown', () => {
  test('null attempts -> attempts_unknown with ask-the-teacher advice', () => {
    const ops = retakeOpportunities([mk({ kind: 'test', score: 6, retakeStatus: 'unknown' })], now);
    expect(ops[0].view).toBe('attempts_unknown');
    expect(ops[0].advice).toMatch(/Ask the teacher/);
    expect(attemptsText(ops[0].assignment)).toBe('? of ?');
  });
  test('unused attempts are NOT treated as an open retake', () => {
    const v = retakeView(mk({ kind: 'quiz', score: 6, attemptsUsed: 1, attemptsAllowed: 3, retakeStatus: 'unknown' }), now);
    expect(v).toBe('unused_attempts_unknown'); expect(isAdvertisedAsAvailable(v)).toBe(false);
  });
  test('unlimited attempts are recorded as unlimited but still not assumed open', () => {
    const a = mk({ kind: 'quiz', score: 6, attemptsUsed: 1, attemptsUnlimited: true, retakeStatus: 'unknown' });
    expect(attemptsText(a)).toBe('1 of unlimited');
    expect(retakeView(a, now)).toBe('unused_attempts_unknown');
  });
  test('Canvas without allowed_attempts maps to unknown, not 1', () => {
    expect(mapCanvasAttempts({ id: 1, name: 'q', due_at: null, lock_at: null, points_possible: 10 })).toEqual({ attemptsUsed: null, attemptsAllowed: null, attemptsUnlimited: false });
    expect(mapCanvasAttempts({ id: 1, name: 'q', due_at: null, lock_at: null, points_possible: 10, allowed_attempts: -1 }).attemptsUnlimited).toBe(true);
  });
});

describe('Metadata checks never touch active assessments', () => {
  test('only allow-listed GETs pass', () => {
    expect(() => assertReadOnlyRequest('GET', '/api/v1/courses/5/assignments?include[]=submission')).not.toThrow();
    expect(() => assertReadOnlyRequest('POST', '/api/v1/courses/5/quizzes/2/submissions')).toThrow(/read-only/);
    expect(() => assertReadOnlyRequest('GET', '/api/v1/courses/5/quizzes/2/quiz_submissions')).toThrow(/active assessment/);
    expect(() => assertReadOnlyRequest('GET', '/api/v1/courses/5/quizzes/2/take')).toThrow();
    expect(() => assertReadOnlyRequest('GET', '/api/v1/courses/5/discussion_topics')).toThrow(/allowlist/);
  });
});
