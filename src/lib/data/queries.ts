/**
 * Data access. Every user-facing function takes the caller's userId and runs inside db.asUser(),
 * so Postgres RLS decides what is visible. There is no code path that reads family data for a user without RLS.
 */
import type { Db, Q } from './engine';
import type { Assignment, GradingPeriod, Reply, FamilyCalendar, ReplyStatus } from '../domain/types';
import type { Scope } from '../domain/assignments';
import { currentPeriod, schoolYearStart } from '../domain/assignments';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const d = (v: unknown) => (v == null ? null : new Date(v as string));
const n = (v: unknown) => (v == null ? null : Number(v));

export function mapAssignment(r: Row): Assignment {
  return {
    id: r.id, familyId: r.family_id, childId: r.child_id, courseId: r.course_id, courseName: r.course_name ?? undefined,
    periodId: r.period_id, source: r.source, title: r.title, kind: r.kind, teacher: r.teacher ?? r.course_teacher ?? null,
    sourceUrl: r.source_url, dueAt: d(r.due_at), closesAt: d(r.closes_at), pointsPossible: n(r.points_possible), score: n(r.score),
    submissionStatus: r.submission_status, submittedAt: d(r.submitted_at), gradedAt: d(r.graded_at), plannerChecked: !!r.planner_checked,
    attemptsUsed: r.attempts_used, attemptsAllowed: r.attempts_allowed, attemptsUnlimited: !!r.attempts_unlimited,
    retakeStatus: r.retake_status, retakeClosesAt: d(r.retake_closes_at), retakeNote: r.retake_note, retakeVerifiedAt: d(r.retake_verified_at),
  };
}
export const mapReply = (r: Row): Reply => ({ id: r.id, assignmentId: r.assignment_id, status: r.status, note: r.note, channel: r.channel, createdAt: new Date(r.created_at) });
const mapPeriod = (r: Row): GradingPeriod => ({ id: r.id, name: r.name, kind: r.kind, startsOn: iso(r.starts_on), endsOn: iso(r.ends_on) });
function iso(v: unknown): string { return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10); }

export interface Me {
  userId: string; familyId: string; familyName: string; role: 'parent' | 'guardian' | 'student';
  displayName: string; childId: string | null; calendar: FamilyCalendar; onboarded: boolean;
  staleDataMode: 'partial_labeled' | 'wait';
}

export async function getMe(db: Db, userId: string): Promise<Me | null> {
  return db.asUser(userId, async (q) => {
    const [m] = await q<Row>(`select m.*, f.name family_name, f.timezone, f.school_days, f.quiet_start::text qs, f.quiet_end::text qe,
        f.onboarded_at, f.stale_data_mode from family_members m join families f on f.id = m.family_id where m.user_id = $1 limit 1`, [userId]);
    if (!m) return null;
    const hol = await q<Row>(`select day::text as day from school_holidays where family_id = $1`, [m.family_id]);
    return {
      userId, familyId: m.family_id, familyName: m.family_name, role: m.role, displayName: m.display_name, childId: m.child_id,
      onboarded: !!m.onboarded_at, staleDataMode: m.stale_data_mode,
      calendar: { timezone: m.timezone, schoolDays: m.school_days, holidays: hol.map((h) => h.day), quietStart: m.qs.slice(0, 5), quietEnd: m.qe.slice(0, 5) },
    };
  });
}

export async function listChildren(db: Db, userId: string) {
  return db.asUser(userId, (q) => q<{ id: string; display_name: string; grade_level: string | null; user_id: string | null }>(
    `select id, display_name, grade_level, user_id from children order by created_at, display_name`));
}

export async function loadChildData(q: Q, childId: string, tz: string, now = new Date()) {
  const [child] = await q<Row>(`select * from children where id = $1`, [childId]);
  if (!child) return null; // RLS hides other families' children, so this is also the authorization check
  const periods = (await q<Row>(`select * from grading_periods where child_id = $1 order by starts_on`, [childId])).map(mapPeriod);
  const courses = await q<Row>(`select * from courses where child_id = $1 order by name`, [childId]);
  const assignments = (await q<Row>(`select a.*, c.name course_name, c.teacher course_teacher from assignments a join courses c on c.id = a.course_id
      where a.child_id = $1 order by a.due_at nulls last`, [childId])).map(mapAssignment);
  const replies = (await q<Row>(`select * from student_replies where child_id = $1 order by created_at`, [childId])).map(mapReply);
  const excl = await q<Row>(`select e.* from assignment_exclusions e join assignments a on a.id = e.assignment_id where a.child_id = $1`, [childId]);
  const incl = await q<Row>(`select i.* from assignment_inclusions i join assignments a on a.id = i.assignment_id where a.child_id = $1`, [childId]);
  const grades = await q<Row>(`select g.*, p.name period_name, p.kind period_kind from grade_records g join grading_periods p on p.id = g.period_id where g.child_id = $1`, [childId]);
  const history = await q<Row>(`select h.*, g.course_id, g.source, g.period_id from grade_history h join grade_records g on g.id = h.grade_record_id where h.child_id = $1 order by h.observed_at`, [childId]);
  const connections = await q<Row>(`select * from integration_connections where child_id = $1 or (child_id is null and family_id = $2)`, [childId, child.family_id]).catch(() => [] as Row[]);
  const scope: Scope = {
    excluded: new Set(excl.map((e) => e.assignment_id)),
    included: new Set(incl.map((i) => i.assignment_id)),
    current: currentPeriod(periods, now, tz),
    yearStart: schoolYearStart(now, periods),
  };
  return { child, periods, courses, assignments, replies, exclusions: excl, scope, grades, history, connections };
}
export type ChildData = NonNullable<Awaited<ReturnType<typeof loadChildData>>>;

export async function getChildData(db: Db, userId: string, childId: string, tz: string) {
  return db.asUser(userId, (q) => loadChildData(q, childId, tz));
}

export async function addReply(db: Db, userId: string, assignmentId: string, status: ReplyStatus, note: string | null, channel: 'app' | 'email_link' = 'app') {
  return db.asUser(userId, async (q) => {
    const [a] = await q<Row>(`select id, child_id, family_id from assignments where id = $1`, [assignmentId]);
    if (!a) throw new Error('Assignment not found');
    await q(`insert into student_replies(family_id, child_id, assignment_id, status, note, channel, author_user_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [a.family_id, a.child_id, a.id, status, note, channel, userId]);
  });
}

export async function excludeAssignment(db: Db, userId: string, assignmentId: string, reason: string) {
  return db.asUser(userId, async (q) => {
    const [a] = await q<Row>(`select family_id from assignments where id = $1`, [assignmentId]);
    if (!a) throw new Error('Assignment not found');
    await q(`insert into assignment_exclusions(assignment_id, family_id, reason, created_by) values ($1,$2,$3,$4) on conflict do nothing`,
      [assignmentId, a.family_id, reason, userId]);
  });
}

export async function includePreviousPeriod(db: Db, userId: string, assignmentId: string, include: boolean) {
  return db.asUser(userId, async (q) => {
    const [a] = await q<Row>(`select family_id from assignments where id = $1`, [assignmentId]);
    if (!a) throw new Error('Assignment not found');
    if (include) await q(`insert into assignment_inclusions(assignment_id, family_id, created_by) values ($1,$2,$3) on conflict do nothing`, [assignmentId, a.family_id, userId]);
    else await q(`delete from assignment_inclusions where assignment_id = $1`, [assignmentId]);
  });
}

export async function getPrefs(db: Db, me: { userId: string; familyId: string }) {
  const [p] = await db.asUser(me.userId, (q) => q<Row>(`select *, summary_time::text st from notification_prefs where user_id = $1 and family_id = $2`, [me.userId, me.familyId]));
  const consents = await db.asUser(me.userId, (q) => q<Row>(`select channel from notification_consents where user_id = $1 and family_id = $2 and revoked_at is null`, [me.userId, me.familyId]));
  return {
    raw: p ?? null,
    rule: { value: p?.followup_delay_value ?? 48, unit: (p?.followup_delay_unit ?? 'hours') as 'hours' | 'school_days' },
    consents: new Set(consents.map((c) => c.channel as string)),
  };
}
