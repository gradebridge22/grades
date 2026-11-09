import type { ChildData } from './data/queries';
import { classify, teacherFollowUps, latestReply, isFromPreviousYear, previousQuarter, scorePct, LOW_SCORE_THRESHOLD, type Bucket, type FollowUpRule } from './domain/assignments';
import { retakeOpportunities } from './domain/retakes';
import { improvementsFromHistory } from './domain/encouragement';
import { freshness, type Freshness } from './domain/sync';
import type { FamilyCalendar, Assignment } from './domain/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function fmtDate(d: Date | string | null | undefined, tz: string, withTime = false, now = new Date()) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const showYear = Math.abs(dt.getTime() - now.getTime()) > 200 * 86400_000; // avoid "Jan 20" meaning last January
  return dt.toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}), ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
}

/** "3 days late", "due tomorrow", "due in 4 days" — calendar days in the family timezone. */
export function dueRelative(a: { dueAt: Date | null }, tz: string, now = new Date()): string | null {
  if (!a.dueAt) return null;
  const day = (d: Date) => new Date(d.toLocaleDateString('en-CA', { timeZone: tz }) + 'T00:00:00Z').getTime();
  const diff = Math.round((day(a.dueAt) - day(now)) / 86400_000);
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  if (diff > 1) return `due in ${diff} days`;
  return diff === -1 ? '1 day late' : `${-diff} days late`;
}

/** Whole-number percent, e.g. 73.3333 → 73. */
export const pct0 = (p: number | null | undefined) => (p == null ? null : Math.round(p * 100));

/** Work done on paper/in class that the online gradebook can't see as "submitted". */
export const isOnPaper = (title: string) => /\b(on paper|paper copy|in class|hand ?written)\b/i.test(title);
export function relTime(d: Date | string | null, now = new Date()) {
  if (!d) return 'never';
  const ms = now.getTime() - new Date(d).getTime();
  const h = Math.round(ms / 3600_000);
  if (Math.abs(h) < 1) return 'just now';
  if (Math.abs(h) < 48) return h > 0 ? `${h}h ago` : `in ${-h}h`;
  const days = Math.round(h / 24);
  return days > 0 ? `${days}d ago` : `in ${-days}d`;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  upcoming: 'Upcoming', overdue: 'Overdue (still open)', missing: 'Missing', submitted_ungraded: 'Submitted · awaiting grade',
  low_score: 'Low score', graded: 'Graded', excused: 'Excused', no_date: 'No due date',
};

export function connectionFreshness(c: Row, now = new Date()): Freshness {
  return freshness({ status: c.status, lastSuccessAt: c.last_success_at ? new Date(c.last_success_at) : null, lastAttemptAt: null, lastError: null, notRefreshed: null }, now);
}

export function summarize(cd: ChildData, cal: FamilyCalendar, rule: FollowUpRule, now = new Date()) {
  const inScope = (a: Assignment) => !cd.scope.excluded.has(a.id);
  const current = cd.scope.current;
  const isCurrent = (a: Assignment) => !isFromPreviousYear(a, cd.scope) && (!current || a.periodId == null || a.periodId === current.id || cd.scope.included.has(a.id));
  const buckets: Record<Bucket, Assignment[]> = { upcoming: [], overdue: [], missing: [], submitted_ungraded: [], low_score: [], graded: [], excused: [], no_date: [] };
  const previous: Assignment[] = [];
  for (const a of cd.assignments) {
    if (!inScope(a)) continue;
    if (!isCurrent(a)) { previous.push(a); continue; }
    buckets[classify(a, now)].push(a);
  }
  const followUps = teacherFollowUps(cd.assignments, cd.replies, cd.scope, rule, cal, now);
  const retakes = retakeOpportunities(cd.assignments.filter(isCurrent), now, cd.scope.excluded);
  const courseName = new Map(cd.courses.map((c: Row) => [c.id, c.name]));
  const series = groupHistory(cd).map((s) => ({ course: courseName.get(s.courseId) ?? 'Course', points: s.points }));
  const improvements = improvementsFromHistory(series);
  const stale = cd.connections.filter((c: Row) => ['reconnect_needed', 'error'].includes(c.status));
  const week = now.getTime() + 7 * 86400_000;
  const dueThisWeek = buckets.upcoming.filter((a) => a.dueAt && a.dueAt.getTime() <= week);
  const lowScores = buckets.low_score.slice().sort((a, b) => (scorePct(a) ?? 0) - (scorePct(b) ?? 0));
  const courses = courseSummaries(cd, buckets, dueThisWeek, now);
  const lowest = courses.filter((c) => c.score != null).sort((a, b) => a.score! - b.score!)[0] ?? null;
  const lastQuarter = lastQuarterSummary(cd, previous, now);
  return { buckets, previous, lastQuarter, followUps, retakes, improvements, stale, dueThisWeek, lowScores, courses, lowest,
    latest: (id: string) => latestReply(cd.replies, id) };
}

export interface CourseSummary {
  id: string; name: string; shortName: string; teacher: string | null;
  /** The school platform's own running course grade (weighted by its categories). */
  score: number | null; scoreSource: 'platform' | 'assignments' | null;
  pastDue: number; dueThisWeek: number; awaiting: number; lowScores: number; graded: number;
}

/** Per-course rollup for the current school year. Never invents a grade: falls back to raw points only when labeled as such. */
export function courseSummaries(cd: ChildData, buckets: Record<Bucket, Assignment[]>, dueThisWeek: Assignment[], now = new Date()): CourseSummary[] {
  void now;
  const count = (list: Assignment[], id: string) => list.filter((a) => a.courseId === id).length;
  return cd.courses.map((c: Row) => {
    const mine = (b: Bucket) => buckets[b].filter((a) => a.courseId === c.id);
    const scored = [...mine('graded'), ...mine('low_score')].filter((a) => a.pointsPossible);
    const pts = scored.reduce((s, a) => s + (a.score ?? 0), 0), possible = scored.reduce((s, a) => s + (a.pointsPossible ?? 0), 0);
    const platform = c.current_score == null ? null : Number(c.current_score);
    return {
      id: c.id, name: c.name, shortName: shortCourse(c.name), teacher: c.teacher ?? null,
      score: platform ?? (possible > 0 ? Math.round((pts / possible) * 1000) / 10 : null),
      scoreSource: platform != null ? 'platform' as const : possible > 0 ? 'assignments' as const : null,
      pastDue: count(buckets.overdue, c.id) + count(buckets.missing, c.id), dueThisWeek: count(dueThisWeek, c.id),
      awaiting: count(buckets.submitted_ungraded, c.id), lowScores: count(buckets.low_score, c.id), graded: scored.length,
    };
  }).filter((c) => c.graded + c.pastDue + c.dueThisWeek + c.awaiting > 0 || c.score != null)
    .sort((a, b) => b.pastDue - a.pastDue || (a.score ?? 101) - (b.score ?? 101));
}

/** "M/J Language Arts 3, Advanced - Rodriguez - p01 - s03" → "M/J Language Arts 3, Advanced". */
export function shortCourse(name: string): string {
  return name.split(' - ')[0].replace(/\s*\(\d{4}-\d{2,4}\)$/, '').trim() || name;
}

export { LOW_SCORE_THRESHOLD };

function groupHistory(cd: ChildData) {
  const m = new Map<string, { courseId: string; points: { percent: number | null; at: Date }[] }>();
  for (const h of cd.history) {
    if (cd.scope.current && h.period_id !== cd.scope.current.id) continue;
    const key = `${h.course_id}:${h.source}`;
    if (!m.has(key)) m.set(key, { courseId: h.course_id, points: [] });
    m.get(key)!.points.push({ percent: h.percent == null ? null : Number(h.percent), at: new Date(h.observed_at) });
  }
  return [...m.values()];
}

export interface GradeCell { percent: number | null; letter: string | null; status: string; source: string; recordedAt: Date; freshness: Freshness | 'manual' }

/** All-course grades table: every course appears, even with no posted grade. Nothing is interpolated. */
export function gradesTable(cd: ChildData, now = new Date()) {
  const connBySource = new Map<string, Row>(cd.connections.map((c: Row) => [c.provider, c]));
  const current = cd.scope.current;
  const semester = cd.periods.find((p) => p.kind === 'semester' && current && p.startsOn <= current.startsOn && p.endsOn >= current.endsOn);
  const prevQuarter = cd.periods.filter((p) => p.kind === 'quarter' && current && p.endsOn < current.startsOn).at(-1);
  const cell = (g: Row | undefined): GradeCell | null => {
    if (!g) return null;
    const conn = connBySource.get(g.source);
    const fresh = !conn || ['csv', 'manual'].includes(conn.provider) ? 'manual' as const : connectionFreshness(conn, now);
    return { percent: g.percent == null ? null : Number(g.percent), letter: g.letter, status: g.status, source: g.source,
      recordedAt: new Date(g.recorded_at), freshness: fresh };
  };
  return cd.courses.map((c: Row) => {
    const g = cd.grades.filter((x: Row) => x.course_id === c.id);
    const pick = (periodId: string | undefined, type: string, kind?: string) =>
      cell(g.find((x: Row) => x.period_id === periodId && x.source_type === type && (!kind || x.kind === kind)));
    const hist = cd.history.filter((h: Row) => h.course_id === c.id && h.period_id === current?.id && h.percent != null)
      .sort((a: Row, b: Row) => +new Date(a.observed_at) - +new Date(b.observed_at));
    const trend = hist.length >= 2 ? Number(hist.at(-1)!.percent) - Number(hist.at(-2)!.percent) : null;
    return {
      course: c, teacher: c.teacher as string | null,
      officialQuarter: pick(current?.id, 'official'),
      platformQuarter: pick(current?.id, 'platform'),
      semester: pick(semester?.id, 'official', 'semester'),
      lastReportCard: pick(prevQuarter?.id, 'official', 'report_card'),
      trend, trendPoints: hist.map((h: Row) => Number(h.percent)),
      hasAnyGrade: g.length > 0,
    };
  });
}

export interface LastQuarter {
  name: string; startsOn: string; endsOn: string;
  items: Assignment[]; missing: Assignment[]; graded: number;
  courses: { id: string; shortName: string; pct: number | null; missing: number; reportCard: number | null }[];
}

/** Read-only recap of the quarter before the current one. Never counted as pending. */
export function lastQuarterSummary(cd: ChildData, previous: Assignment[], now = new Date()): LastQuarter | null {
  const p = previousQuarter(cd.periods, cd.scope.current);
  if (!p) return null;
  const items = previous.filter((a) => a.periodId === p.id);
  const missing = items.filter((a) => ['missing', 'overdue'].includes(classify(a, now)));
  const graded = items.filter((a) => a.score != null && a.pointsPossible);
  const courses = cd.courses.map((c: Row) => {
    const g = graded.filter((a) => a.courseId === c.id);
    const pts = g.reduce((t, a) => t + (a.score ?? 0), 0), poss = g.reduce((t, a) => t + (a.pointsPossible ?? 0), 0);
    const rc = cd.grades.find((x: Row) => x.course_id === c.id && x.period_id === p.id && x.percent != null);
    return { id: c.id, shortName: shortCourse(c.name), pct: poss ? pts / poss : null,
      missing: missing.filter((a) => a.courseId === c.id).length, reportCard: rc ? Number(rc.percent) : null };
  }).filter((c) => c.pct != null || c.missing || c.reportCard != null);
  return { name: p.name, startsOn: p.startsOn, endsOn: p.endsOn, items, missing, graded: graded.length, courses };
}

export interface QuarterStat { name: string; pct: number | null; graded: number; missing: number; reportCard: number | null; reportLetter: string | null }
export interface CourseOverview {
  id: string; name: string; teacher: string | null;
  canvasNow: number | null; canvasAt: Date | null;
  current: QuarterStat | null; previous: QuarterStat | null;
}

/** One row per course from data we actually have: Canvas running grade, per-quarter graded work, report cards when imported. */
export function courseOverview(cd: ChildData, now = new Date()): CourseOverview[] {
  const cur = cd.scope.current, prev = previousQuarter(cd.periods, cur);
  const stat = (p: typeof cur, courseId: string): QuarterStat | null => {
    if (!p) return null;
    const items = cd.assignments.filter((a) => a.courseId === courseId && a.periodId === p.id && !cd.scope.excluded.has(a.id));
    const graded = items.filter((a) => a.score != null && a.pointsPossible);
    const pts = graded.reduce((t, a) => t + (a.score ?? 0), 0), poss = graded.reduce((t, a) => t + (a.pointsPossible ?? 0), 0);
    const missing = items.filter((a) => ['missing', 'overdue'].includes(classify(a, now))).length;
    const rc = cd.grades.find((g: Row) => g.course_id === courseId && g.period_id === p.id && g.source_type === 'official' && g.percent != null);
    return { name: p.name, pct: poss ? pts / poss : null, graded: graded.length, missing,
      reportCard: rc ? Number(rc.percent) : null, reportLetter: rc?.letter ?? null };
  };
  return cd.courses.map((c: Row) => ({
    id: c.id, name: c.name, teacher: c.teacher ?? null,
    canvasNow: c.current_score == null ? null : Number(c.current_score),
    canvasAt: c.current_score_at ? new Date(c.current_score_at) : null,
    current: stat(cur, c.id), previous: stat(prev, c.id),
  })).sort((a, b) => (a.canvasNow ?? 999) - (b.canvasNow ?? 999));
}
