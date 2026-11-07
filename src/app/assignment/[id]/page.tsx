import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs } from '@/lib/data/queries';
import { classify, inReminderScope, isVerifiedComplete, teacherFollowUps } from '@/lib/domain/assignments';
import { RETAKE_LABELS, attemptsText, retakeAdvice, retakeView, isAdvertisedAsAvailable } from '@/lib/domain/retakes';
import { REPLY_LABELS } from '@/lib/domain/types';
import { BUCKET_LABEL, fmtDate } from '@/lib/view';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { ReplyButtons } from '@/components/ReplyButtons';
import { dismissAssignment, restoreAssignment, toggleInclude } from '@/app/actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function AssignmentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const me = await requireMe();
  const db = await getDb();
  const [row] = await db.asUser(me.userId, (q) => q<Row>(`select child_id from assignments where id = $1`, [id]));
  if (!row) notFound();
  const cd = (await getChildData(db, me.userId, row.child_id, me.calendar.timezone))!;
  const a = cd.assignments.find((x) => x.id === id)!;
  const { rule } = await getPrefs(db, me);
  const tz = me.calendar.timezone, now = new Date();
  const replies = cd.replies.filter((r) => r.assignmentId === id).sort((x, y) => +y.createdAt - +x.createdAt);
  const authors = await db.asUser(me.userId, (q) => q<Row>(`select r.id, m.display_name from student_replies r left join family_members m on m.user_id = r.author_user_id and m.family_id = r.family_id where r.assignment_id = $1`, [id]));
  const excl = cd.exclusions.find((e: Row) => e.assignment_id === id);
  const inScope = inReminderScope(a, cd.scope);
  const prevPeriod = cd.scope.current && a.periodId && a.periodId !== cd.scope.current.id;
  const rv = retakeView(a, now);
  const fu = teacherFollowUps([a], cd.replies, cd.scope, rule, me.calendar, now)[0];
  const isParent = me.role !== 'student';
  const periodName = cd.periods.find((p) => p.id === a.periodId)?.name ?? 'Unassigned';
  const dl = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;

  return (
    <div className="grid gap-4">
      <PageHeader title={a.title} back={{ href: isParent ? `/child/${a.childId}/assignments` : '/student', label: 'Assignments' }}
        sub={<div className="flex flex-wrap gap-1.5"><Badge>{BUCKET_LABEL[classify(a, now)]}</Badge>{excl && <Badge tone="muted">Dismissed</Badge>}
          {!inScope && !excl && <Badge tone="muted">Not in current reminders</Badge>}{isVerifiedComplete(a) && <Badge tone="good">Completion verified by source</Badge>}</div>} />
      {sp.saved && <p className="rounded-lg bg-brand-soft p-2 text-sm text-brand">Reply saved. Thanks for the update!</p>}
      {sp.err === 'note' && <p className="rounded-lg bg-warn-soft p-2 text-sm text-warn">Please type a short reason for “Other”.</p>}
      {fu && <div className="rounded-lg border border-brand/40 bg-brand-soft p-3 text-sm text-brand">
        <strong>Needs teacher follow-up.</strong> {fu.reason === 'done_but_ungraded' ? `Marked done ${fmtDate(fu.since, tz, true)}, no grade after ${rule.value} ${rule.unit.replace('_', ' ')}.` : fu.reason === 'needs_code' ? 'Student needs a code from the teacher.' : 'Student asked for help.'}
      </div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Details">
          <dl className="divide-y divide-line text-sm">
            {dl('Course', a.courseName)}{dl('Teacher', a.teacher ?? 'Unknown')}{dl('Grading period', periodName)}
            {dl('Due', fmtDate(a.dueAt, tz, true))}{dl('Closes', a.closesAt ? fmtDate(a.closesAt, tz, true) : 'Not specified')}
            {dl('Score', a.score != null ? `${a.score} / ${a.pointsPossible ?? '?'}` : 'Not graded')}
            {dl('Submission (from source)', a.submissionStatus.replace('_', ' '))}
            {dl('Planner checkbox', a.plannerChecked ? 'Checked — not proof of submission' : 'Unchecked')}
            {dl('Source', a.source.toUpperCase())}
            {a.sourceUrl && dl('Link', <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">Open in {a.source}</a>)}
            {a.kind !== 'assignment' && <>{dl('Attempts', attemptsText(a))}{dl('Retake', <Badge tone={isAdvertisedAsAvailable(rv) ? 'good' : 'warn'}>{RETAKE_LABELS[rv]}</Badge>)}</>}
          </dl>
          {retakeAdvice(rv) && <p className="mt-2 text-xs text-muted">💡 {retakeAdvice(rv)}</p>}
        </Card>

        <Card title={me.role === 'student' ? 'Your reply' : 'Reply for the record'}>
          <ReplyButtons assignmentId={a.id} />
        </Card>
      </div>

      <Card title="Reply history">
        {replies.length === 0 ? <Empty>No replies yet.</Empty> : (
          <ol className="relative ml-2 border-l border-line">
            {replies.map((r) => (
              <li key={r.id} className="mb-3 ml-4">
                <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
                <div className="text-sm font-medium">{REPLY_LABELS[r.status]}{r.note && <span className="font-normal text-muted"> — “{r.note}”</span>}</div>
                <div className="text-xs text-muted">{fmtDate(r.createdAt, tz, true)} · {authors.find((x) => x.id === r.id)?.display_name ?? 'Unknown'} · via {r.channel === 'email_link' ? 'email link' : 'app'}</div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {isParent && (
        <Card title="Parent controls">
          {excl ? (
            <form action={restoreAssignment} className="grid gap-2 text-sm">
              <p>Dismissed permanently. Reason: <em>{excl.reason}</em></p>
              <input type="hidden" name="assignmentId" value={a.id} />
              <button className="btn-ghost w-fit">Restore (audited)</button>
            </form>
          ) : (
            <form action={dismissAssignment} className="grid gap-2">
              <input type="hidden" name="assignmentId" value={a.id} />
              <label><span className="label">Dismiss as stale or incorrectly flagged — reason required</span>
                <input name="reason" required minLength={3} maxLength={500} className="input" placeholder="e.g. Teacher confirmed it was optional" /></label>
              <button className="btn-ghost w-fit">Dismiss permanently</button>
              <p className="text-xs text-muted">Dismissals survive future syncs and stop all reminders for this item.</p>
            </form>
          )}
          {prevPeriod && !excl && (
            <form action={toggleInclude} className="mt-3 border-t border-line pt-3 text-sm">
              <input type="hidden" name="assignmentId" value={a.id} />
              <input type="hidden" name="include" value={cd.scope.included.has(a.id) ? '0' : '1'} />
              <p className="mb-2 text-muted">This is from a previous grading period ({periodName}).</p>
              <button className="btn-ghost">{cd.scope.included.has(a.id) ? 'Stop including in reminders' : 'Include in current reminders anyway'}</button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
