// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://district.instructure.com/"}
import { describe, test, expect, vi } from 'vitest';
// @ts-expect-error plain JS module
import { canvasReader } from '../extension/readers.js';

const routes: Record<string, unknown> = {
  '/api/v1/users/self': { id: 9, name: 'Demo Parent' },
  '/api/v1/users/self/observees': [{ id: 42, name: 'Ava Synthetic' }],
  '/api/v1/users/42/courses': [{ id: 7, name: 'Algebra I', teachers: [{ display_name: 'Mx. Demo' }], enrollments: [{ type: 'student', user_id: 42, computed_current_score: 78.5, computed_current_grade: 'C+' }] }],
  '/api/v1/courses/7/assignments': [
    { id: 1, name: 'Quiz 3.2', is_quiz_assignment: true, html_url: 'https://district.instructure.com/courses/7/assignments/1', due_at: '2026-10-30T16:00:00Z', lock_at: null, points_possible: 10, allowed_attempts: 3,
      submission: [{ user_id: 99, score: 10 }, { user_id: 42, workflow_state: 'graded', score: 6, submitted_at: '2026-10-30T15:00:00Z', attempt: 1 }] },
    { id: 2, name: 'Reading log', html_url: 'javascript:alert(1)', due_at: null, lock_at: null, points_possible: 10, submission: { user_id: 42, workflow_state: 'unsubmitted', missing: true } },
  ],
};

describe('Canvas reader (parent observer session)', () => {
  test('reads the observed student, picks THEIR submission, keeps unknowns unknown, strips unsafe links', async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const u = new URL(url); calls.push({ url: u.pathname, method: init.method ?? 'GET' });
      const body = routes[u.pathname];
      return new Response('while(1);' + JSON.stringify(body ?? []), { status: body ? 200 : 404 });
    });
    const r = await canvasReader({ childName: 'Ava (synthetic)' });
    expect(r.studentName).toBe('Ava Synthetic');
    expect(r.grades).toEqual([{ courseExternalId: '7', periodLabel: 'current', kind: 'quarter', status: 'provisional', percent: 78.5, letter: 'C+' }]);
    const quiz = r.assignments.find((a: { externalId: string }) => a.externalId === '1');
    expect(quiz).toMatchObject({ kind: 'quiz', score: 6, submissionStatus: 'graded', attemptsUsed: 1, attemptsAllowed: 3 });
    const log = r.assignments.find((a: { externalId: string }) => a.externalId === '2');
    expect(log).toMatchObject({ sourceUrl: null, submissionStatus: 'missing', attemptsAllowed: null, attemptsUnlimited: false });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls.some((c) => /quiz_submissions|take/.test(c.url))).toBe(false);
    vi.unstubAllGlobals();
  });
  test('a signed-out tab fails clearly instead of sending empty data', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    await expect(canvasReader({})).rejects.toThrow(/Not signed in/);
    vi.unstubAllGlobals();
  });
});
