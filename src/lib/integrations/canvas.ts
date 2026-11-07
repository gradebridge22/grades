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
  // Canvas exposes allowed_attempts on the assignment (-1 unlimited). If absent, attempts are UNKNOWN — never assume.
  const unlimited = a.allowed_attempts === -1;
  const allowed = a.allowed_attempts != null && a.allowed_attempts > 0 ? a.allowed_attempts : null;
  const used = a.submission?.attempt ?? null;
  return { attemptsUsed: used, attemptsAllowed: allowed, attemptsUnlimited: unlimited };
}

export interface CanvasData { courses: { id: number; name: string; teacher: string | null; currentScore: number | null }[]; assignments: (CanvasAssignment & { courseId: number })[] }

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
      const courses = await get<{ id: number; name: string; enrollments?: { computed_current_score?: number | null }[]; teachers?: { display_name: string }[] }[]>(
        `/api/v1/users/${opts.studentCanvasId}/courses?include[]=total_scores&include[]=teachers&enrollment_state=active&per_page=100`);
      const assignments: CanvasData['assignments'] = [];
      for (const c of courses) {
        const list = await get<CanvasAssignment[]>(`/api/v1/courses/${c.id}/assignments?include[]=submission&per_page=100`);
        for (const a of list) assignments.push({ ...a, courseId: c.id });
      }
      return {
        courses: courses.map((c) => ({ id: c.id, name: c.name, teacher: c.teachers?.[0]?.display_name ?? null, currentScore: c.enrollments?.[0]?.computed_current_score ?? null })),
        assignments,
      };
    },
  };
}
