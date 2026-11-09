import type { Assignment, GradingPeriod, Reply, FamilyCalendar } from './types';
import { DONE_REPLIES } from './types';
import { addDelay, localDate } from './calendar';

export type Bucket = 'upcoming' | 'overdue' | 'missing' | 'submitted_ungraded' | 'low_score' | 'graded' | 'excused' | 'no_date';

export const LOW_SCORE_THRESHOLD = 0.7;

export function scorePct(a: Pick<Assignment, 'score' | 'pointsPossible'>): number | null {
  if (a.score == null || !a.pointsPossible) return null;
  return a.score / a.pointsPossible;
}

/** Submission according to the SOURCE system. The planner checkbox is deliberately ignored. */
export function isSubmitted(a: Assignment): boolean {
  return a.submissionStatus === 'submitted' || a.submissionStatus === 'graded' || a.submittedAt != null || a.score != null;
}

export function isClosed(a: Assignment, now: Date): boolean {
  return a.closesAt != null && a.closesAt.getTime() <= now.getTime();
}

/** Work that can still be turned in. */
export function isStillDoable(a: Assignment, now: Date): boolean {
  return !isSubmitted(a) && a.submissionStatus !== 'excused' && !isClosed(a, now);
}

/** Primary bucket. Submitted work is never "missing", even if a stale missing flag lingers. */
export function classify(a: Assignment, now: Date): Bucket {
  if (a.submissionStatus === 'excused') return 'excused';
  if (isSubmitted(a)) {
    const pct = scorePct(a);
    if (pct == null) return a.score == null ? 'submitted_ungraded' : 'graded';
    return pct < LOW_SCORE_THRESHOLD ? 'low_score' : 'graded';
  }
  if (a.submissionStatus === 'missing') return 'missing';
  if (a.dueAt == null) return 'no_date';
  if (a.dueAt.getTime() > now.getTime()) return 'upcoming';
  return isClosed(a, now) ? 'missing' : 'overdue';
}

/** The grading period (quarter preferred) containing today in the family timezone. */
export function currentPeriod(periods: GradingPeriod[], now: Date, tz: string): GradingPeriod | null {
  const today = localDate(now, tz);
  const containing = periods.filter((p) => p.startsOn <= today && today <= p.endsOn);
  const rank = { quarter: 0, semester: 1, year: 2 } as const;
  const hit = containing.sort((a, b) => rank[a.kind] - rank[b.kind])[0];
  if (hit) return hit;
  // Break between quarters (e.g. a teacher workday or winter break): stay on the quarter that just ended.
  const recent = DateTimeShift(today, -30);
  return periods.filter((p) => p.kind === 'quarter' && p.startsOn <= today && p.endsOn >= recent)
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ?? null;
}

function DateTimeShift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Quarter a due date belongs to: the latest quarter that started on or before it (so a break day
 * after a quarter ends still counts toward that quarter). Null when there are no quarters or the
 * date is before the first one.
 */
export function quarterFor(dueAt: Date | null, quarters: GradingPeriod[], tz: string): GradingPeriod | null {
  if (!dueAt) return null;
  const d = localDate(dueAt, tz);
  const qs = quarters.filter((p) => p.kind === 'quarter' && p.startsOn <= d).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
  return qs[0] ?? null;
}

/** Fill in a missing period from the due date so the quarter filter works for every item. */
export function withInferredPeriods(list: Assignment[], periods: GradingPeriod[], tz: string): Assignment[] {
  if (!periods.some((p) => p.kind === 'quarter')) return list;
  return list.map((a) => (a.periodId != null ? a : { ...a, periodId: quarterFor(a.dueAt, periods, tz)?.id ?? null }));
}

/** The quarter right before the current one (e.g. Q1 while in Q2). */
export function previousQuarter(periods: GradingPeriod[], current: GradingPeriod | null): GradingPeriod | null {
  if (!current) return null;
  return periods.filter((p) => p.kind === 'quarter' && p.endsOn < current.startsOn)
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ?? null;
}

export interface Scope {
  excluded: Set<string>;  // permanent parent dismissals
  included: Set<string>;  // previous-period items deliberately included
  current: GradingPeriod | null;
  /** Start of the current school year. Work due before it (e.g. last year's items left in a reused course) is history, not a to-do. */
  yearStart?: Date | null;
}

/**
 * Start of the current school year: the earliest configured grading period that is still part of this school year,
 * otherwise July 15 (US school years start in late July/August).
 */
export function schoolYearStart(now: Date, periods: Pick<GradingPeriod, 'startsOn' | 'endsOn'>[] = []): Date {
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fallback = `${y}-07-15`;
  const inYear = periods.filter((p) => p.endsOn >= fallback).map((p) => p.startsOn).sort()[0];
  return new Date(`${inYear && inYear < fallback ? inYear : fallback}T00:00:00Z`);
}

/** Due before this school year started (and not deliberately brought back by a parent). */
export function isFromPreviousYear(a: Assignment, scope: Pick<Scope, 'yearStart' | 'included'>): boolean {
  return !!scope.yearStart && !!a.dueAt && a.dueAt.getTime() < scope.yearStart.getTime() && !scope.included.has(a.id);
}

/** Should this assignment appear in CURRENT reminders/summaries? */
export function inReminderScope(a: Assignment, scope: Scope): boolean {
  if (scope.excluded.has(a.id)) return false;                  // exclusions always win
  if (scope.included.has(a.id)) return true;
  if (isFromPreviousYear(a, scope)) return false;               // last year's leftovers never trigger reminders
  if (!scope.current) return true;                              // no periods configured: don't hide anything
  if (a.periodId == null) return true;
  return a.periodId === scope.current.id;
}

export function latestReply(replies: Reply[], assignmentId: string): Reply | null {
  let best: Reply | null = null;
  for (const r of replies) if (r.assignmentId === assignmentId && (!best || r.createdAt > best.createdAt)) best = r;
  return best;
}

/** Completion is verified only by the source (score or graded status) — never by a reply or checkbox. */
export function isVerifiedComplete(a: Assignment): boolean {
  return a.score != null || a.submissionStatus === 'graded' || a.submissionStatus === 'excused';
}

export interface FollowUpRule { value: number; unit: 'hours' | 'school_days' }

export type FollowUpReason = 'done_but_ungraded' | 'needs_code' | 'need_help';

export interface FollowUpItem { assignment: Assignment; reason: FollowUpReason; since: Date; dueSince?: Date }

/**
 * "Needs teacher follow-up": the student says it's done but no grade appeared after the configured delay,
 * or the student needs a code/help that only the teacher can give.
 */
export function teacherFollowUps(
  assignments: Assignment[], replies: Reply[], scope: Scope, rule: FollowUpRule, cal: FamilyCalendar, now: Date,
): FollowUpItem[] {
  const out: FollowUpItem[] = [];
  for (const a of assignments) {
    if (scope.excluded.has(a.id) || isVerifiedComplete(a)) continue;
    const r = latestReply(replies, a.id);
    if (!r) continue;
    if (DONE_REPLIES.has(r.status)) {
      const deadline = addDelay(r.createdAt, rule.value, rule.unit, cal);
      if (now.getTime() >= deadline.getTime()) out.push({ assignment: a, reason: 'done_but_ungraded', since: r.createdAt, dueSince: deadline });
    } else if (r.status === 'needs_code') out.push({ assignment: a, reason: 'needs_code', since: r.createdAt });
    else if (r.status === 'need_help') out.push({ assignment: a, reason: 'need_help', since: r.createdAt });
  }
  return out;
}

/**
 * Reminders for the next school day: still-doable work that remains incomplete.
 * Suppressed when the student already says it's done (that becomes a teacher follow-up instead).
 */
export function remindersDue(assignments: Assignment[], replies: Reply[], scope: Scope, now: Date): Assignment[] {
  return assignments.filter((a) => {
    if (!inReminderScope(a, scope) || !isStillDoable(a, now)) return false;
    const r = latestReply(replies, a.id);
    if (r && DONE_REPLIES.has(r.status)) return false;
    const b = classify(a, now);
    if (b === 'overdue') return true;
    if (b === 'upcoming' && a.dueAt) return a.dueAt.getTime() - now.getTime() < 3 * 86400_000;
    return r?.status === 'need_at_school';
  });
}

/** Items needing a student answer: overdue/missing work in scope that has no reply yet. */
export function questionsToAsk(assignments: Assignment[], replies: Reply[], scope: Scope, now: Date): Assignment[] {
  return assignments.filter((a) => {
    if (!inReminderScope(a, scope)) return false;
    const b = classify(a, now);
    if (b !== 'overdue' && b !== 'missing') return false;
    return !latestReply(replies, a.id);
  });
}
