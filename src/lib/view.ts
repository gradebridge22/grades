import type { ChildData } from './data/queries';
import { classify, teacherFollowUps, latestReply, type Bucket, type FollowUpRule } from './domain/assignments';
import { retakeOpportunities } from './domain/retakes';
import { improvementsFromHistory } from './domain/encouragement';
import { freshness, type Freshness } from './domain/sync';
import type { FamilyCalendar, Assignment } from './domain/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function fmtDate(d: Date | string | null | undefined, tz: string, withTime = false) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
}
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
  const isCurrent = (a: Assignment) => !current || a.periodId == null || a.periodId === current.id || cd.scope.included.has(a.id);
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
  return { buckets, previous, followUps, retakes, improvements, stale, latest: (id: string) => latestReply(cd.replies, id) };
}

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
