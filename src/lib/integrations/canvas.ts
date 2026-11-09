/**
 * Canvas LMS adapter — STATUS: implemented against the documented REST API, untested against a live district.
 * Requires an authorized token: a parent OBSERVER account's token (preferred) or a district-issued OAuth2 developer key.
 * The adapter is strictly READ-ONLY: it can only issue GET requests to an allowlist of metadata endpoints.
 * It cannot start a quiz, open a test session, answer questions, or submit anything.
 */
import type { ProviderAdapter } from '../domain/sync';
import type { SubmissionStatus } from '../domain/types';

const ALLOWED_GET: RegExp[] = [
  /^\/api\/v1\/users\/self$/,
  /^\/api\/v1\/users\/self\/observees$/,
  /^\/api\/v1\/users\/\d+\/courses$/,
  /^\/api\/v1\/courses\/\d+\/assignments$/,
  /^\/api\/v1\/courses\/\d+\/assignment_groups$/,
  /^\/api\/v1\/courses\/\d+\/quizzes$/, // quiz SETTINGS list only (attempt limits); never quiz_submissions
  /^\/api\/v1\/courses\/\d+\/enrollments$/,
  /^\/api\/v1\/users\/\d+\/missing_submissions$/,
];
const FORBIDDEN = /(quiz_submissions|\/take\b|\/sessions?\b|\/submissions\/?$|\/questions|\/events|\/complete)/i;

export function assertReadOnlyRequest(method: string, path: string): void {
  if (method.toUpperCase() !== 'GET') throw new Error(`Blocked: ${method} not allowed (read-only adapter)`);
  const p = path.split('?')[0];
  if (FORBIDDEN.test(p)) throw new Error(`Blocked: ${p} could interact with an active assessment`);
  if (!ALLOWED_GET.some((r) => r.test(p))) throw new Error(`Blocked: ${p} is not on the read-only allowlist`);
}

export interface CanvasAssignment {
  id: number; name: string; html_url?: string; due_at: string | null; lock_at: string | null; points_possible: number | null;
  is_quiz_assignment?: boolean; allowed_attempts?: number; // -1 = unlimited
  quiz_id?: number; submission_types?: string[];
  /** Attempt limit from the quiz's own settings (classic quizzes keep it there, not on the assignment). */
  quizAllowedAttempts?: number | null;
  assignment_group_id?: number;
  submission?: { workflow_state: string; submitted_at: string | null; score: number | null; graded_at: string | null; missing?: boolean; excused?: boolean; attempt?: number | null };
}

export function mapCanvasSubmission(a: CanvasAssignment): SubmissionStatus {
  const s = a.submission;
  if (!s) return 'unknown';
  if (s.excused) return 'excused';
  if (s.workflow_state === 'graded' && s.score != null) return 'graded';
  if (s.submitted_at || s.workflow_state === 'submitted' || s.workflow_state === 'pending_review') return 'submitted';
  if (s.missing) return 'missing';
  return 'not_submitted';
}

export function mapCanvasAttempts(a: CanvasAssignment) {
  // Classic quizzes keep their attempt limit in the quiz settings; the assignment then reports -1 ("unlimited"),
  // which is NOT true. For quizzes, only the quiz's own setting counts; if we couldn't read it, attempts are unknown.
  const isQuiz = !!a.is_quiz_assignment || a.quiz_id != null || (a.submission_types ?? []).includes('online_quiz');
  const limit = isQuiz ? a.quizAllowedAttempts : a.allowed_attempts;
  const unlimited = limit === -1;
  const allowed = limit != null && limit > 0 ? limit : null;
  const used = a.submission?.attempt ?? null;
  return { attemptsUsed: used, attemptsAllowed: allowed, attemptsUnlimited: unlimited };
}

export interface CanvasData {
  courses: { id: number; name: string; teacher: string | null; currentScore: number | null; weighted?: boolean }[];
  assignments: (CanvasAssignment & { courseId: number; groupName?: string | null; groupWeight?: number | null })[];
}

export function canvasAdapter(opts: { baseUrl: string; token: string; studentCanvasId: number; childName: string; fetchImpl?: typeof fetch }): ProviderAdapter<CanvasData> {
  const f = opts.fetchImpl ?? fetch;
  async function get<T>(path: string): Promise<T> {
    assertReadOnlyRequest('GET', path);
    const res = await f(new URL(path, opts.baseUrl), { method: 'GET', headers: { Authorization: `Bearer ${opts.token}`, Accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('unauthorized'), { auth: true });
    if (!res.ok) throw new Error(`Canvas ${res.status}`);
    return res.json() as Promise<T>;
  }
  return {
    name: 'Canvas',
    describeScope: () => `Assignments, scores and course grades for ${opts.childName}`,
    async checkAuth() {
      try { await get('/api/v1/users/self'); return { ok: true }; }
      catch (e) { return { ok: false, reason: (e as { auth?: boolean }).auth ? 'Canvas token expired or was revoked' : (e as Error).message }; }
    },
    async fetchAll() {
      const courses = await get<{ id: number; name: string; apply_assignment_group_weights?: boolean; enrollments?: { computed_current_score?: number | null; current_period_computed_current_score?: number | null; has_grading_periods?: boolean }[]; teachers?: { display_name: string }[] }[]>(
        `/api/v1/users/${opts.studentCanvasId}/courses?include[]=total_scores&include[]=current_grading_period_scores&include[]=teachers&enrollment_state=active&per_page=100`);
      const assignments: CanvasData['assignments'] = [];
      for (const c of courses) {
        const list = await get<CanvasAssignment[]>(`/api/v1/courses/${c.id}/assignments?include[]=submission&per_page=100`);
        // Gradebook categories ("Tests 40%") — optional: a district may hide them, so a failure here never fails the sync.
        const groups = await get<{ id: number; name: string; group_weight?: number | null }[]>(`/api/v1/courses/${c.id}/assignment_groups?per_page=100`).catch(() => []);
        const byId = new Map(groups.map((g) => [g.id, g]));
        const hasQuiz = list.some((a) => a.quiz_id != null || a.is_quiz_assignment);
        const quizzes = hasQuiz ? await get<{ id: number; allowed_attempts?: number | null }[]>(`/api/v1/courses/${c.id}/quizzes?per_page=100`).catch(() => []) : [];
        const quizLimit = new Map(quizzes.map((q) => [q.id, q.allowed_attempts ?? null]));
        for (const a of list) {
          const g = a.assignment_group_id != null ? byId.get(a.assignment_group_id) : undefined;
          assignments.push({ ...a, courseId: c.id, groupName: g?.name ?? null, groupWeight: c.apply_assignment_group_weights ? g?.group_weight ?? null : null,
            quizAllowedAttempts: a.quiz_id != null ? quizLimit.get(a.quiz_id) ?? null : null });
        }
      }
      return {
        courses: courses.map((c) => ({ id: c.id, name: c.name, teacher: c.teachers?.[0]?.display_name ?? null, // Canvas's grade page shows the CURRENT grading period (e.g. Q2) when the course uses grading periods; match that.
          currentScore: (() => { const e = c.enrollments?.[0]; if (!e) return null;
            return e.has_grading_periods && e.current_period_computed_current_score != null ? e.current_period_computed_current_score : e.computed_current_score ?? null; })(), weighted: !!c.apply_assignment_group_weights })),
        assignments,
      };
    },
  };
}
