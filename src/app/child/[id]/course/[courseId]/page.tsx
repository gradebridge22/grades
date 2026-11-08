import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs } from '@/lib/data/queries';
import { summarize, shortCourse, fmtDate, dueRelative, isOnPaper, connectionFreshness, relTime } from '@/lib/view';
import { courseStatus, STATUS_LABEL, pointsPct, type CourseStatus } from '@/lib/workLists';
import { scorePct } from '@/lib/domain/assignments';
import { letterFor } from '@/lib/viewPrefs';
import { getViewPrefs } from '@/lib/viewPrefs.server';
import { courseColor } from '@/lib/courseColor';
import { Empty } from '@/components/ui';
import type { Assignment } from '@/lib/domain/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const FILTERS: { id: string; label: string; test: (s: CourseStatus) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'open', label: 'Past due', test: (s) => s === 'late' || s === 'missing' },
  { id: 'soon', label: 'Upcoming', test: (s) => s === 'soon' },
  { id: 'waiting', label: 'Waiting for grade', test: (s) => s === 'waiting' },
  { id: 'graded', label: 'Graded', test: (s) => s === 'graded' },
];
const CHIP: Record<CourseStatus, string> = {
  missing: 'bg-[#ffdcdc] text-[#9a2323]', late: 'bg-[#ffe7d6] text-[#8a4315]', soon: 'bg-[#eaf2ff] text-[#1c4fa0]',
  waiting: 'bg-[#f1f0ec] text-[#4a4a45]', graded: 'bg-[#ddf5e4] text-[#1f6b3a]', excused: 'bg-[#f1f0ec] text-[#6a6a66]', nodate: 'bg-[#f1f0ec] text-[#6a6a66]',
};
const pctTxt = (p: number | null) => (p == null ? '—' : `${Math.round(p)}%`);
const score = (a: Assignment) => `${a.score == null ? '—' : Math.round(a.score * 10) / 10} / ${a.pointsPossible ?? '—'}`;
const groupOf = (a: Assignment) => a.groupName || (a.kind === 'quiz' ? 'Quizzes' : a.kind === 'test' ? 'Tests' : 'Assignments');

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string; courseId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id, courseId } = await params; const sp = await searchParams;
  const me = await requireMe();
  const db = await getDb();
  const cd = await getChildData(db, me.userId, id, me.calendar.timezone).catch(() => null);
  if (!cd) notFound();
  const course = cd.courses.find((c: Row) => c.id === courseId);
  if (!course) notFound();
  const { rule } = await getPrefs(db, me);
  const view = sp.view === 'report' || sp.view === 'gradebook' ? sp.view : (await getViewPrefs()).coursePage;
  const now = new Date(); const tz = me.calendar.timezone;
  const s = summarize(cd, me.calendar, rule, now);
  const sum = s.courses.find((c) => c.id === courseId);
  const previousIds = new Set(s.previous.map((a) => a.id));
  const mine = cd.assignments.filter((a) => a.courseId === courseId && !previousIds.has(a.id) && !cd.scope.excluded.has(a.id));
  const hiddenOld = cd.assignments.filter((a) => a.courseId === courseId && previousIds.has(a.id)).length;
  const f = FILTERS.find((x) => x.id === sp.f) ?? FILTERS[0];
  const shown = mine.filter((a) => f.test(courseStatus(a, now))).sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0));

  // Gradebook categories, heaviest first.
  const groups = new Map<string, Assignment[]>();
  for (const a of mine) { const g = groupOf(a); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(a); }
  const cats = [...groups.entries()].map(([name, list]) => ({
    name, weight: list.find((a) => a.groupWeight != null)?.groupWeight ?? null, pct: pointsPct(list),
    rows: shown.filter((a) => groupOf(a) === name),
  })).sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.name.localeCompare(b.name));
  const weighted = cats.some((c) => c.weight != null);
  const fixable = mine.filter((a) => { const st = courseStatus(a, now); return st === 'late' || (st === 'graded' && (scorePct(a) ?? 1) === 0 && a.closesAt != null && a.closesAt > now); }).slice(0, 4);

  const col = courseColor(course.name);
  const grade = sum?.score ?? null;
  const conn = cd.connections.find((c: Row) => c.provider === 'canvas');
  const href = (o: Record<string, string>) => `/child/${id}/course/${courseId}?${new URLSearchParams({ view, f: f.id, ...o })}`;
  const periods = cd.grades.filter((g: Row) => g.course_id === courseId).sort((a: Row, b: Row) => String(a.period_name).localeCompare(String(b.period_name)));

  const statusChip = (a: Assignment) => { const st = courseStatus(a, now); return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${CHIP[st]}`}>{STATUS_LABEL[st]}{isOnPaper(a.title) && (st === 'late' || st === 'missing') ? ' · on paper' : ''}</span>
  ); };
  const pctCell = (a: Assignment) => { const p = scorePct(a); return <span className={`nums font-semibold ${p != null && p < 0.7 ? 'text-bad' : ''}`}>{p == null ? '—' : `${Math.round(p * 100)}%`}</span>; };

  return (
    <div className="grid gap-5">
      <header className="overflow-hidden rounded-[24px]" style={{ background: `color-mix(in srgb, ${col} 16%, white)`, color: `color-mix(in srgb, ${col} 75%, black)` }}>
        <div className="flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <Link href={me.role === 'student' ? '/student' : `/child/${id}`} className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold">← {cd.child.display_name}</Link>
            <h1 className="text-[30px] font-extrabold leading-tight sm:text-[36px]">{shortCourse(course.name)}</h1>
            <div className="mt-1 text-sm font-medium opacity-85">{course.teacher ?? 'Teacher not listed'}{conn ? ` · synced from Canvas ${relTime(conn.last_success_at, now)}` : ''}{conn && connectionFreshness(conn, now) !== 'current' ? ' (may be out of date)' : ''}</div>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-2"><span className="text-[52px] font-extrabold leading-none">{pctTxt(grade)}</span>{grade != null && <span className="rounded-full bg-white px-3 py-1 text-lg font-extrabold">{letterFor(grade)}</span>}</div>
            <div className="mt-1 text-xs font-medium opacity-80">{sum?.scoreSource === 'platform' ? 'Course grade from Canvas' : sum?.scoreSource === 'assignments' ? 'Estimate: points average, not weighted' : 'No grade posted yet'}</div>
          </div>
        </div>
        <nav aria-label="Course view" className="flex gap-1 px-4 sm:px-5">
          {(['gradebook', 'report'] as const).map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={view === v ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-t-2xl px-4 text-sm font-bold ${view === v ? 'bg-paper text-ink' : 'opacity-80 hover:opacity-100'}`}>
              {v === 'gradebook' ? 'Gradebook' : 'Report card'}
            </Link>
          ))}
        </nav>
      </header>

      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {FILTERS.map((x) => {
          const n = mine.filter((a) => x.test(courseStatus(a, now))).length;
          return (
            <Link key={x.id} href={href({ f: x.id })} aria-current={x.id === f.id ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${x.id === f.id ? 'bg-ink text-white' : 'border border-line bg-white hover:bg-[#faf7f0]'}`}>
              {x.label}<span className={`rounded-full px-2 py-0.5 text-xs ${x.id === f.id ? 'bg-white/20' : 'bg-[#f1f0ec]'}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {view === 'gradebook' ? (
        <div className="flex flex-wrap items-start gap-5">
          <div className="grid min-w-0 flex-[999_1_560px] gap-4">
            {cats.filter((c) => c.rows.length).length === 0 && <Empty>Nothing matches this filter.</Empty>}
            {cats.filter((c) => c.rows.length).map((c) => (
              <section key={c.name} className="notebook-card overflow-x-auto">
                <div className="flex items-center justify-between border-b border-line bg-[#fbf9f4] px-4 py-3">
                  <span className="text-[15px] font-bold">{c.name}{c.weight != null && <span className="font-medium text-muted"> · {Math.round(c.weight)}% of grade</span>}</span>
                  <span className={`nums text-sm font-semibold ${c.pct != null && c.pct < 70 ? 'text-bad' : ''}`}>{pctTxt(c.pct)}</span>
                </div>
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr className="text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Assignment</th><th className="px-4 py-2 font-medium">Due</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Score</th><th className="px-4 py-2 text-right font-medium">%</th></tr></thead>
                  <tbody>
                    {c.rows.map((a) => (
                      <tr key={a.id} className="border-t border-[#f2efe7]">
                        <td className="px-4 py-2.5"><Link href={`/assignment/${a.id}`} className="font-semibold hover:underline">{a.title}</Link></td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDate(a.dueAt, tz, false, now)}{['late', 'missing', 'soon'].includes(courseStatus(a, now)) && <span className="block text-xs">{dueRelative(a, tz, now)}</span>}</td>
                        <td className="px-4 py-2.5">{statusChip(a)}</td>
                        <td className="nums whitespace-nowrap px-4 py-2.5 text-right text-muted">{score(a)}</td>
                        <td className="px-4 py-2.5 text-right">{pctCell(a)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
          <aside className="grid min-w-0 flex-[1_1_280px] gap-4">
            <section className="notebook-card p-4 sm:p-5">
              <h2 className="mb-3 text-[15px] font-bold">{weighted ? 'How the grade is made' : 'By category'}</h2>
              {cats.map((c) => (
                <div key={c.name} className="mb-3">
                  <div className="flex justify-between text-sm"><span>{c.name}{c.weight != null && <span className="text-muted"> ({Math.round(c.weight)}%)</span>}</span><span className="nums">{pctTxt(c.pct)}</span></div>
                  <span className="mt-1.5 block h-2 rounded-full bg-[#efebe0]"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(0, c.pct ?? 0))}%`, background: c.pct != null && c.pct < 70 ? '#d9534f' : col }} /></span>
                </div>
              ))}
              {!weighted && <p className="text-xs text-muted">Category weights weren&apos;t shared by the course, so these are plain point averages.</p>}
            </section>
            {fixable.length > 0 && (
              <section className="rounded-[20px] bg-[#ffe7d6] p-4 text-[#6b3410] sm:p-5">
                <h2 className="mb-1 text-[15px] font-bold">Fastest way to raise this grade</h2>
                <p className="mb-2 text-sm">Still open, so they can still count:</p>
                <ul className="grid gap-1.5 text-sm">{fixable.map((a) => <li key={a.id}><Link href={`/assignment/${a.id}`} className="font-semibold underline">{a.title}</Link> <span className="opacity-80">· {dueRelative(a, tz, now)}</span></li>)}</ul>
              </section>
            )}
          </aside>
        </div>
      ) : (
        <div className="grid gap-4">
          <section className="notebook-card overflow-x-auto">
            <table className="w-full min-w-[520px] text-center text-sm">
              <thead><tr className="bg-[#fbf9f4] text-xs font-bold uppercase tracking-[0.05em] text-muted">
                {periods.map((p: Row) => <th key={p.id} className="border-l border-line px-3 py-2.5 first:border-l-0">{p.period_name}</th>)}
                <th className="border-l border-line px-3 py-2.5">Current</th>
              </tr></thead>
              <tbody><tr>
                {periods.map((p: Row) => (
                  <td key={p.id} className="border-l border-line px-3 py-4 first:border-l-0">
                    <div className="text-2xl font-extrabold">{p.letter ?? letterFor(p.percent == null ? null : Number(p.percent)) ?? '—'}</div>
                    <div className="nums text-sm text-muted">{p.percent == null ? '' : `${Math.round(Number(p.percent))}%`}</div>
                    <div className="text-[11px] text-muted">{p.status === 'final' ? 'final' : 'in progress'}</div>
                  </td>
                ))}
                <td className="border-l border-line px-3 py-4" style={{ background: `color-mix(in srgb, ${col} 8%, white)` }}>
                  <div className="text-2xl font-extrabold">{letterFor(grade) ?? '—'}</div><div className="nums text-sm text-muted">{pctTxt(grade)}</div>
                  <div className="text-[11px] text-muted">{sum?.scoreSource === 'platform' ? 'Canvas' : 'estimate'}</div>
                </td>
              </tr></tbody>
            </table>
            {periods.length === 0 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Quarter and semester grades appear here after a Skyward import (CSV or the browser extension).</p>}
          </section>
          {cats.filter((c) => c.rows.length).map((c) => (
            <section key={c.name} className="notebook-card overflow-x-auto">
              <div className="flex justify-between border-b border-line bg-[#fbf9f4] px-4 py-2.5 text-sm"><span className="font-bold">{c.name}{c.weight != null && <span className="font-normal text-muted"> · weight {Math.round(c.weight)}%</span>}</span><span className="nums">{pctTxt(c.pct)}</span></div>
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Assignment</th><th className="px-4 py-2 font-medium">Due</th><th className="px-4 py-2 text-right font-medium">Points</th><th className="px-4 py-2 text-right font-medium">Grade</th><th className="px-4 py-2 font-medium">Flag</th></tr></thead>
                <tbody>
                  {c.rows.map((a) => { const st = courseStatus(a, now); return (
                    <tr key={a.id} className={`border-t border-[#f2efe7] ${st === 'missing' ? 'bg-[#fff6f5]' : st === 'late' ? 'bg-[#fffaf3]' : ''}`}>
                      <td className="px-4 py-2.5"><Link href={`/assignment/${a.id}`} className="font-semibold hover:underline">{a.title}</Link></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDate(a.dueAt, tz, false, now)}</td>
                      <td className="nums whitespace-nowrap px-4 py-2.5 text-right">{score(a)}</td>
                      <td className="px-4 py-2.5 text-right">{pctCell(a)}</td>
                      <td className={`px-4 py-2.5 text-xs font-bold ${st === 'missing' ? 'text-bad' : st === 'late' ? 'text-warn' : 'text-muted'}`}>{st === 'graded' ? '' : STATUS_LABEL[st]}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
      {hiddenOld > 0 && <p className="text-xs text-muted">{hiddenOld} item{hiddenOld === 1 ? '' : 's'} from before this school year are hidden for this course.</p>}
    </div>
  );
}
