import { expect, test } from 'vitest';
import { mapCanvasAttempts, assertReadOnlyRequest } from '../src/lib/integrations/canvas';

test('classic quiz: assignment says -1 but the quiz allows 2 → 2 used means no attempts left', () => {
  const a = { id: 1, name: 'Benchmark', due_at: null, lock_at: null, points_possible: 105, is_quiz_assignment: true, quiz_id: 9, allowed_attempts: -1, quizAllowedAttempts: 2, submission: { workflow_state: 'graded', submitted_at: 'x', score: 75, graded_at: 'x', attempt: 2 } };
  expect(mapCanvasAttempts(a)).toEqual({ attemptsUsed: 2, attemptsAllowed: 2, attemptsUnlimited: false });
});

test('quiz whose settings could not be read: never assume unlimited', () => {
  const a = { id: 1, name: 'Q', due_at: null, lock_at: null, points_possible: 10, quiz_id: 9, allowed_attempts: -1, quizAllowedAttempts: null, submission: { workflow_state: 'graded', submitted_at: 'x', score: 7, graded_at: 'x', attempt: 1 } };
  expect(mapCanvasAttempts(a)).toEqual({ attemptsUsed: 1, attemptsAllowed: null, attemptsUnlimited: false });
});

test('quiz settings list is allowed, quiz submissions are not', () => {
  expect(() => assertReadOnlyRequest('GET', '/api/v1/courses/5/quizzes?per_page=100')).not.toThrow();
  expect(() => assertReadOnlyRequest('GET', '/api/v1/courses/5/quizzes/9/submissions')).toThrow();
});
