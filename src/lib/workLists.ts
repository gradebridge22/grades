import type { Assignment } from './domain/types';
import { DONE_REPLIES } from './domain/types';
import { classify, scorePct } from './domain/assignments';
import type { summarize } from './view';

export const WORK_FILTERS = {
  open: { label: 'Past due · still open', title: 'Past due — can still be turned in', sub: 'Late, but the submission window is still open. Closing soonest first.' },
  week: { label: 'Due this week', title: 'Due this week', sub: 'The next 7 days, soonest first.' },
  waiting: { label: 'Waiting for a grade', title: 'Waiting for a grade', sub: 'Turned in; not graded yet. Oldest first.' },
  closed: { label: 'Missing · closed', title: 'Missing — submission window closed', sub: 'Can’t be turned in online anymore. Worth asking about late credit or make-up work.' },
  low: { label: 'Under 70%', title: 'Low scores this school year', sub: 'Graded under 70%, lowest first.' },
  all: { label: 'Everything', title: 'All work this school year', sub: 'Every assignment in the current school year, newest due date first.' },
} as const;
export type WorkFilter = keyof typeof WORK_FILTERS;

type Summary = ReturnType<typeof summarize>;

/** The exact lists behind each dashboard number, so a click shows the same items the count was made from. */
export function workLists(s: Summary): Record<WorkFilter, Assignment[]> {
  const unanswered = (a: Assignment) => { const r = s.latest(a.id); return !r || !DONE_REPLIES.has(r.status); };
  const t = (d: Date | null, fallback: number) => d?.getTime() ?? fallback;
  const all = Object.values(s.buckets).flat();
  return {
    open: s.buckets.overdue.filter(unanswered).sort((a, b) => t(a.closesAt, Infinity) - t(b.closesAt, Infinity) || t(b.dueAt, 0) - t(a.dueAt, 0)),
    week: s.dueThisWeek.slice().sort((a, b) => t(a.dueAt, 0) - t(b.dueAt, 0)),
    waiting: s.buckets.submitted_ungraded.slice().sort((a, b) => t(a.dueAt, 0) - t(b.dueAt, 0)),
    closed: s.buckets.missing.filter(unanswered).sort((a, b) => t(b.dueAt, 0) - t(a.dueAt, 0)),
    low: s.lowScores,
    all: all.sort((a, b) => t(b.dueAt, 0) - t(a.dueAt, 0)),
  };
}

export type CourseStatus = 'missing' | 'late' | 'soon' | 'waiting' | 'graded' | 'excused' | 'nodate';
export function courseStatus(a: Assignment, now: Date): CourseStatus {
  const b = classify(a, now);
  return b === 'missing' ? 'missing' : b === 'overdue' ? 'late' : b === 'upcoming' ? 'soon' : b === 'submitted_ungraded' ? 'waiting'
    : b === 'excused' ? 'excused' : b === 'no_date' ? 'nodate' : 'graded';
}
export const STATUS_LABEL: Record<CourseStatus, string> = {
  missing: 'Missing', late: 'Late · still open', soon: 'Upcoming', waiting: 'Turned in', graded: 'Graded', excused: 'Excused', nodate: 'No due date',
};

/** Points earned / possible over graded work. */
export function pointsPct(list: Assignment[]): number | null {
  const g = list.filter((a) => a.score != null && a.pointsPossible);
  const poss = g.reduce((s, a) => s + (a.pointsPossible ?? 0), 0);
  return poss ? (g.reduce((s, a) => s + (a.score ?? 0), 0) / poss) * 100 : null;
}
export { scorePct };
