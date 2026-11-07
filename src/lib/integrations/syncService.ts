import type { Db, Q } from '../data/engine';
import { runSync, type ConnectionState, type ProviderAdapter } from '../domain/sync';
import { mapCanvasAttempts, mapCanvasSubmission, type CanvasData } from './canvas';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface NormalizedAssignment {
  courseExternalId: string; courseName: string; teacher: string | null;
  externalId: string; title: string; kind: 'assignment' | 'quiz' | 'test'; sourceUrl: string | null;
  dueAt: string | null; closesAt: string | null; pointsPossible: number | null; score: number | null;
  submissionStatus: string; submittedAt: string | null; gradedAt: string | null;
  attemptsUsed: number | null; attemptsAllowed: number | null; attemptsUnlimited: boolean;
}

export function normalizeCanvas(d: CanvasData): NormalizedAssignment[] {
  return d.assignments.map((a) => {
    const c = d.courses.find((x) => x.id === a.courseId);
    return {
      courseExternalId: String(a.courseId), courseName: c?.name ?? `Course ${a.courseId}`, teacher: c?.teacher ?? null,
      externalId: String(a.id), title: a.name, kind: a.is_quiz_assignment ? 'quiz' : 'assignment',
      sourceUrl: a.html_url?.startsWith('https://') ? a.html_url : null,
      dueAt: a.due_at, closesAt: a.lock_at, pointsPossible: a.points_possible, score: a.submission?.score ?? null,
      submissionStatus: mapCanvasSubmission(a), submittedAt: a.submission?.submitted_at ?? null, gradedAt: a.submission?.graded_at ?? null,
      ...mapCanvasAttempts(a),
    };
  });
}

export interface NormalizedGrade {
  courseExternalId: string; courseName: string; teacher: string | null;
  /** Period name as shown by the source ("Q1", "Quarter 2", "S1") or "current" for the platform's running grade. */
  periodLabel: string; kind: 'quarter' | 'semester' | 'report_card'; status: 'provisional' | 'final';
  percent: number | null; letter: string | null; sourceType: 'official' | 'platform';
}

async function upsertCourse(q: Q, conn: Row, externalId: string, name: string, teacher: string | null): Promise<string> {
  const [course] = await q<Row>(`insert into courses(family_id, child_id, name, teacher, source, external_id) values ($1,$2,$3,$4,$5,$6)
      on conflict (child_id, source, external_id) do update set name = excluded.name, teacher = coalesce(excluded.teacher, courses.teacher) returning id`,
    [conn.family_id, conn.child_id, name, teacher, conn.provider, externalId]);
  return course.id;
}

/** Match a source's period label to a configured grading period. Never invents a period or its dates. */
export function matchPeriod(label: string, periods: { id: string; name: string; kind: string; s: string; e: string }[], today: string) {
  const l = label.trim().toLowerCase();
  if (l === 'current') return periods.find((p) => p.kind === 'quarter' && p.s <= today && today <= p.e) ?? null;
  const norm = (x: string) => x.toLowerCase().replace(/quarter|qtr/g, 'q').replace(/semester|sem/g, 's').replace(/[^a-z0-9]/g, '');
  return periods.find((p) => p.name.toLowerCase() === l) ?? periods.find((p) => norm(p.name) === norm(label)) ?? null;
}

/** Apply a normalized snapshot. Exported for the browser-extension ingest path. */
export async function applyNormalized(q: Q, conn: Row, items: NormalizedAssignment[], grades: NormalizedGrade[], now: Date,
  courses: { externalId: string; name: string; teacher: string | null }[] = []) {
  for (const c of courses) await upsertCourse(q, conn, c.externalId, c.name, c.teacher);
  const assignments = await upsertAssignments(q, conn, items, now);
  const periods = await q<{ id: string; name: string; kind: string; s: string; e: string }>(
    `select id, name, kind, starts_on::text s, ends_on::text e from grading_periods where child_id = $1`, [conn.child_id]);
  const today = now.toISOString().slice(0, 10);
  const warnings: string[] = [];
  let g = 0;
  for (const gr of grades) {
    const p = matchPeriod(gr.periodLabel, periods, today);
    if (!p) { warnings.push(`No grading period matches "${gr.periodLabel}" — add it under the child's periods to store this grade`); continue; }
    const cid = await upsertCourse(q, conn, gr.courseExternalId, gr.courseName, gr.teacher);
    await q(`insert into grade_records(family_id, child_id, course_id, period_id, source, source_type, kind, status, percent, letter, recorded_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict (course_id, source, period_id, kind) do update set percent = excluded.percent, letter = excluded.letter,
          status = excluded.status, recorded_at = excluded.recorded_at`,
      [conn.family_id, conn.child_id, cid, p.id, conn.provider, gr.sourceType, gr.kind, gr.status, gr.percent, gr.letter, now.toISOString()]);
    g++;
  }
  return { assignments, grades: g, warnings: [...new Set(warnings)] };
}

/** Upsert by (child, source, external_id). Parent exclusions/inclusions and student replies live in other tables and are untouched. */
async function upsertAssignments(q: Q, conn: Row, items: NormalizedAssignment[], now: Date): Promise<number> {
  let n = 0;
  for (const it of items) {
    const course = { id: await upsertCourse(q, conn, it.courseExternalId, it.courseName, it.teacher) };
    const [period] = await q<Row>(`select id from grading_periods where child_id = $1 and kind = 'quarter'
        and coalesce($2::timestamptz, $3::timestamptz)::date between starts_on and ends_on limit 1`, [conn.child_id, it.dueAt, now.toISOString()]);
    await q(`insert into assignments(family_id, child_id, course_id, period_id, source, external_id, title, kind, teacher, source_url, due_at, closes_at,
          points_possible, score, submission_status, submitted_at, graded_at, attempts_used, attempts_allowed, attempts_unlimited, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        on conflict (child_id, source, external_id) do update set title = excluded.title, kind = excluded.kind, teacher = excluded.teacher,
          source_url = excluded.source_url, due_at = excluded.due_at, closes_at = excluded.closes_at, points_possible = excluded.points_possible,
          score = excluded.score, submission_status = excluded.submission_status, submitted_at = excluded.submitted_at, graded_at = excluded.graded_at,
          attempts_used = excluded.attempts_used, attempts_allowed = excluded.attempts_allowed, attempts_unlimited = excluded.attempts_unlimited,
          period_id = coalesce(assignments.period_id, excluded.period_id), updated_at = excluded.updated_at`,
      [conn.family_id, conn.child_id, course.id, period?.id ?? null, conn.provider, it.externalId, it.title, it.kind, it.teacher, it.sourceUrl,
       it.dueAt, it.closesAt, it.pointsPossible, it.score, it.submissionStatus, it.submittedAt, it.gradedAt, it.attemptsUsed, it.attemptsAllowed,
       it.attemptsUnlimited, now.toISOString()]);
    n++;
  }
  return n;
}

export async function syncConnection<T>(db: Db, connectionId: string, adapter: ProviderAdapter<T>, normalize: (d: T) => NormalizedAssignment[], now = new Date()) {
  const [conn] = await db.asService((q) => q<Row>(`select * from integration_connections where id = $1`, [connectionId]));
  if (!conn) throw new Error('connection not found');
  const prev: ConnectionState = {
    status: conn.status, lastAttemptAt: conn.last_attempt_at ? new Date(conn.last_attempt_at) : null,
    lastSuccessAt: conn.last_success_at ? new Date(conn.last_success_at) : null, lastError: conn.last_error, notRefreshed: conn.not_refreshed,
  };
  const result = await runSync(adapter, prev, now);
  return db.asService(async (q) => {
    let upserted = 0;
    if (result.outcome === 'success') upserted = await upsertAssignments(q, conn, normalize(result.data), now);
    const s = result.state;
    await q(`update integration_connections set status = $2, last_attempt_at = $3, last_success_at = $4, last_error = $5, not_refreshed = $6 where id = $1`,
      [connectionId, s.status, s.lastAttemptAt?.toISOString() ?? null, s.lastSuccessAt?.toISOString() ?? null, s.lastError, s.notRefreshed]);
    await q(`insert into sync_runs(family_id, connection_id, started_at, finished_at, outcome, items_upserted, message) values ($1,$2,$3,$3,$4,$5,$6)`,
      [conn.family_id, connectionId, now.toISOString(), result.outcome, upserted, s.lastError]);
    return { outcome: result.outcome, upserted, state: s };
  });
}
