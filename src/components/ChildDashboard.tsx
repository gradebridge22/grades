import Link from 'next/link';
import type { ChildData, Me } from '@/lib/data/queries';
import { summarize, shortCourse, type CourseSummary } from '@/lib/view';
import { nudge, praise } from '@/lib/domain/encouragement';
import { RETAKE_LABELS, isAdvertisedAsAvailable } from '@/lib/domain/retakes';
import { DONE_REPLIES, type Assignment } from '@/lib/domain/types';
import { Card, Badge, Empty, Tally, Praise, Stamp } from './ui';
import { AssignmentRow } from './AssignmentRow';
import { ReplyButtons } from './ReplyButtons';
import { sendCheer } from '@/app/actions';
import { courseColor } from '@/lib/courseColor';
import type { FollowUpRule } from '@/lib/domain/assignments';
import { getViewPrefs } from '@/lib/viewPrefs.server';
import { letterFor, type SectionId } from '@/lib/viewPrefs';

const gradeTone = (p: number | null) => (p == null ? 'text-muted' : p < 70 ? 'text-bad' : p < 80 ? 'text-warn' : 'text-good');
const byUrgency = (a: Assignment, b: Assignment) =>
  (a.closesAt?.getTime() ?? Infinity) - (b.closesAt?.getTime() ?? Infinity) || (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0);

export async function ChildDashboard({ cd, me, rule, asStudent }: { cd: ChildData; me: Me; rule: FollowUpRule; asStudent: boolean }) {
  const view = await getViewPrefs();
  const now = new Date();
  const s = summarize(cd, me.calendar, rule, now);
  const tz = me.calendar.timezone;
  const childId = cd.child.id as string;
  const unanswered = (a: Assignment) => { const r = s.latest(a.id); return !r || !DONE_REPLIES.has(r.status); };
  const canStillTurnIn = s.buckets.overdue.filter(unanswered).sort(byUrgency);
  const closedMissing = s.buckets.missing.filter(unanswered).sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0));
  const saidDone = [...s.buckets.overdue, ...s.buckets.missing].filter((a) => !unanswered(a));
  const pastDue = canStillTurnIn.length + closedMissing.length;
  const confirmedRetakes = s.retakes.filter((r) => isAdvertisedAsAvailable(r.view));
  const row = (a: Assignment, extra?: React.ReactNode) => (
    <AssignmentRow key={a.id} a={a} tz={tz} now={now} reply={s.latest(a.id)} extra={extra} />
  );
  const withReplies = (list: Assignment[]) => asStudent
    ? list.map((a) => (
      <Card key={a.id} stripe={courseColor(a.courseName ?? a.courseId)}>
        <ul><AssignmentRow a={a} tz={tz} reply={s.latest(a.id)} now={now} stripe={false} /></ul>
        <div className="mt-2"><ReplyButtons assignmentId={a.id} back="/student" /></div>
      </Card>))
    : <Card><ul>{list.map((a) => row(a))}</ul></Card>;

  const work = (f: string) => `/child/${childId}/work?f=${f}`;
  const sections: Record<SectionId, React.ReactNode> = {
    pastDue: (
      <section key="pastDue" className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px] font-extrabold">{asStudent ? 'Can you still turn these in?' : 'Past due — can still be turned in'} <span className="text-muted">({canStillTurnIn.length})</span></h2>
          {canStillTurnIn.length > 0 && <Link href={work('open')} className="text-sm font-semibold text-link">See list</Link>}
        </div>
        {canStillTurnIn.length === 0 ? <Empty>Nothing past due that&apos;s still open. 🎉</Empty> : withReplies(canStillTurnIn)}
      </section>
    ),
    dueWeek: (
      <Card key="dueWeek" title={<>Due this week <span className="text-muted">({s.dueThisWeek.length})</span></>}
        action={<Link href={work('week')} className="text-sm font-semibold text-link">See list</Link>}>
        {s.dueThisWeek.length === 0 ? <Empty>Nothing due in the next 7 days.</Empty> : <ul>{s.dueThisWeek.map((a) => row(a))}</ul>}
      </Card>
    ),
    closed: closedMissing.length > 0 ? (
      <details key="closed" className="notebook-card p-4 sm:p-5" open={closedMissing.length <= 5}>
        <summary className="cursor-pointer text-[17px] font-bold">
          Missing — submission window closed <span className="text-muted">({closedMissing.length})</span>
        </summary>
        <p className="mt-1 text-xs text-muted">These can&apos;t be turned in online anymore. Worth asking the teacher about late credit or make-up work.</p>
        {asStudent ? <div className="mt-3 grid gap-3">{withReplies(closedMissing)}</div> : <ul className="mt-2">{closedMissing.map((a) => row(a))}</ul>}
      </details>
    ) : null,
    lowScores: (s.lowScores.length > 0 || confirmedRetakes.length > 0) ? (
      <Card key="lowScores" title={<>Low scores this year <span className="text-muted">({s.lowScores.length})</span></>}
        action={<Link href={work('low')} className="text-sm font-semibold text-link">See all</Link>}>
        <p className="mb-1 text-xs text-muted">Graded under 70%. Lowest first. Ask about corrections or retakes where the teacher allows them.</p>
        <ul>
          {confirmedRetakes.map((r) => row(r.assignment, <Badge tone="good">{RETAKE_LABELS[r.view]}</Badge>))}
          {s.lowScores.filter((a) => !confirmedRetakes.some((r) => r.assignment.id === a.id)).slice(0, 6).map((a) => row(a))}
        </ul>
      </Card>
    ) : null,
    saidDone: saidDone.length > 0 ? (
      <Card key="saidDone" title={<>Says it&apos;s done — not graded yet <span className="text-muted">({saidDone.length})</span></>}>
        <ul>{saidDone.map((a) => row(a))}</ul>
      </Card>
    ) : null,
    cheer: !asStudent ? (
      <div key="cheer" className="rounded-[22px] bg-brand p-5 text-white">
        <div className="text-xl font-extrabold leading-tight">{s.improvements[0] ? praise(s.improvements[0], childId) : 'Effort counts. Tell them you noticed.'}</div>
        <form action={sendCheer} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="childId" value={childId} />
          <label className="sr-only" htmlFor="cheer">Message</label>
          <input id="cheer" name="message" className="input !rounded-full !border-0" maxLength={200} required defaultValue="Proud of the effort you're putting in this week!" />
          <button className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full bg-white px-5 text-sm font-bold text-ink">Send a cheer</button>
        </form>
      </div>
    ) : null,
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Praise className="flex-1">{s.improvements[0] ? praise(s.improvements[0], childId + now.toDateString()) : nudge(childId + now.toDateString())}</Praise>
        <Link href={`/settings/view?back=${encodeURIComponent(asStudent ? '/student' : `/child/${childId}`)}`} className="btn-ghost">Customize view</Link>
      </div>
      {s.stale.length > 0 && <Stamp>Some school data couldn&apos;t refresh. What you see may be out of date. <Link className="underline" href="/settings/connections">Check connections</Link></Stamp>}

      <Tally items={[
        { label: 'past due', value: pastDue, tone: pastDue ? 'warn' : 'good', sub: canStillTurnIn.length ? `${canStillTurnIn.length} can still be turned in` : 'nothing still open', href: work('open') },
        { label: 'due this week', value: s.dueThisWeek.length, tone: 'info', sub: 'next 7 days', href: work('week') },
        { label: 'waiting for a grade', value: s.buckets.submitted_ungraded.length, tone: 'neutral', sub: 'turned in', href: work('waiting') },
        { label: 'missing · closed', value: closedMissing.length, tone: closedMissing.length ? 'bad' : 'good', sub: 'ask about late credit', href: work('closed') },
        { label: 'under 70%', value: s.lowScores.length, tone: s.lowScores.length ? 'bad' : 'good', sub: 'this school year', href: work('low') },
      ]} />

      {s.courses.length > 0 && (view.courses === 'tiles'
        ? <CourseTiles courses={s.courses} childId={childId} />
        : <CourseTable courses={s.courses} childId={childId} />)}

      {view.order.map((id) => sections[id])}

      {s.previous.length > 0 && (
        <details className="rounded-[20px] border border-dashed border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted">
            Hidden: {s.previous.length} item{s.previous.length === 1 ? '' : 's'} from before this school year or an earlier grading period
          </summary>
          <p className="mt-1 text-xs text-muted">Usually last year&apos;s assignments left in a course the teacher reused. They don&apos;t count in the numbers above and never trigger reminders.</p>
          <ul className="mt-2">{s.previous.map((a) => <AssignmentRow key={a.id} a={a} tz={tz} now={now} />)}</ul>
        </details>
      )}
    </div>
  );
}

const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
const shade = (c: string) => `color-mix(in srgb, ${c} 75%, black)`;

function CourseTiles({ courses, childId }: { courses: CourseSummary[]; childId: string }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[22px] font-extrabold">Courses</h2>
        <span className="text-xs text-muted">Tap a course for its full gradebook</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {courses.map((c) => {
          const col = courseColor(c.name);
          return (
            <Link key={c.id} href={`/child/${childId}/course/${c.id}`} className="flex min-h-[140px] flex-col gap-2 rounded-[24px] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-12px_rgba(0,0,0,0.35)]"
              style={{ background: tint(col, 16), color: shade(col) }}>
              <span className="flex items-start justify-between gap-2">
                <span className="text-[16px] font-bold leading-snug">{shortCourse(c.name)}</span>
                {c.score != null && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{letterFor(c.score)}</span>}
              </span>
              <span className="text-[42px] font-extrabold leading-none tracking-[-0.02em]">{c.score == null ? '—' : `${Math.round(c.score)}%`}</span>
              <span className="text-xs font-medium opacity-85">
                {c.teacher ?? ''}{c.scoreSource === 'assignments' ? ' · estimate' : ''}
                {c.pastDue ? <> · <strong>{c.pastDue} past due</strong></> : c.dueThisWeek ? <> · {c.dueThisWeek} this week</> : ' · caught up'}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CourseTable({ courses, childId }: { courses: CourseSummary[]; childId: string }) {
  const n = (v: number, tone: string) => (v ? <span className={`nums font-semibold ${tone}`}>{v}</span> : <span className="text-muted">–</span>);
  return (
    <Card title="Courses this year" action={<Link href={`/child/${childId}/grades`} className="text-sm font-medium text-link">Grades</Link>}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-1 py-1.5 font-medium">Course</th>
              <th className="px-1 py-1.5 text-right font-medium">Grade</th>
              <th className="px-1 py-1.5 text-right font-medium">Past due</th>
              <th className="px-1 py-1.5 text-right font-medium">This week</th>
              <th className="px-1 py-1.5 text-right font-medium">Waiting</th>
              <th className="px-1 py-1.5 text-right font-medium">Under 70%</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-1 py-2">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: courseColor(c.name) }} />
                    <Link href={`/child/${childId}/course/${c.id}`} className="font-semibold hover:underline" title={c.name}>{shortCourse(c.name)}</Link>
                  </div>
                  {c.teacher && <div className="pl-4 text-xs text-muted">{c.teacher}</div>}
                </td>
                <td className="px-1 py-2 text-right">
                  {c.score == null ? <span className="text-muted">—</span> : (
                    <span className={`nums font-semibold ${gradeTone(c.score)}`}>{Math.round(c.score)}%</span>
                  )}
                  {c.scoreSource === 'assignments' && <div className="text-[10px] text-muted" title="Canvas course grade not available yet: plain points average of graded work, not weighted">points avg</div>}
                </td>
                <td className="px-1 py-2 text-right">{n(c.pastDue, 'text-warn')}</td>
                <td className="px-1 py-2 text-right">{n(c.dueThisWeek, 'text-link')}</td>
                <td className="px-1 py-2 text-right">{n(c.awaiting, 'text-ink')}</td>
                <td className="px-1 py-2 text-right">{n(c.lowScores, 'text-bad')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Grade = the school platform&apos;s running course grade. &ldquo;points avg&rdquo; = estimate until the next sync brings the official number.</p>
    </Card>
  );
}
