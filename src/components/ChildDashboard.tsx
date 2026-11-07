import Link from 'next/link';
import type { ChildData, Me } from '@/lib/data/queries';
import { summarize } from '@/lib/view';
import { nudge, praise } from '@/lib/domain/encouragement';
import { RETAKE_LABELS, isAdvertisedAsAvailable } from '@/lib/domain/retakes';
import { DONE_REPLIES } from '@/lib/domain/types';
import { Card, Badge, Empty, Tally, Praise } from './ui';
import { AssignmentRow } from './AssignmentRow';
import { ReplyButtons } from './ReplyButtons';
import { sendCheer } from '@/app/actions';
import { courseColor } from '@/lib/courseColor';
import type { FollowUpRule } from '@/lib/domain/assignments';

export function ChildDashboard({ cd, me, rule, asStudent }: { cd: ChildData; me: Me; rule: FollowUpRule; asStudent: boolean }) {
  const now = new Date();
  const s = summarize(cd, me.calendar, rule, now);
  const tz = me.calendar.timezone;
  const needsAnswer = [...s.buckets.overdue, ...s.buckets.missing].filter((a) => { const r = s.latest(a.id); return !r || !DONE_REPLIES.has(r.status); });
  const childId = cd.child.id as string;
  const openRetakes = s.retakes.filter((r) => isAdvertisedAsAvailable(r.view)).length;
  return (
    <div className="grid gap-6">
      <Praise>{s.improvements[0] ? praise(s.improvements[0], childId + now.toDateString()) : nudge(childId + now.toDateString())}</Praise>
      <Tally items={[
        { label: 'to answer', value: needsAnswer.length, tone: needsAnswer.length ? 'warn' : 'good' },
        { label: 'coming up', value: s.buckets.upcoming.length, tone: 'info' },
        { label: 'awaiting grade', value: s.buckets.submitted_ungraded.length },
        { label: 'retakes open', value: openRetakes, tone: 'good' },
      ]} />

      <div className="grid gap-4">
        <h2 className="text-[15px] font-semibold">{asStudent ? 'Quick check: what happened with these?' : 'Waiting on an answer'}</h2>
        {needsAnswer.length === 0 ? <Empty>All caught up — nice.</Empty> : needsAnswer.map((a) => (
          <Card key={a.id} stripe={courseColor(a.courseName ?? a.courseId)}>
            <ul><AssignmentRow a={a} tz={tz} reply={s.latest(a.id)} now={now} stripe={false} /></ul>
            {asStudent && <div className="mt-2"><ReplyButtons assignmentId={a.id} back="/student" /></div>}
          </Card>
        ))}
      </div>

      <Card title="Coming up" action={<Link href={`/child/${childId}/assignments`} className="text-sm font-medium text-link">All work</Link>}>
        {s.buckets.upcoming.length === 0 ? <Empty>Nothing due soon.</Empty> : (
          <ul>{s.buckets.upcoming.map((a) => <AssignmentRow key={a.id} a={a} reply={s.latest(a.id)} tz={tz} now={now} />)}</ul>
        )}
      </Card>

      {s.retakes.length > 0 && (
        <Card title="Chances to improve">
          <ul>
            {s.retakes.map((r) => (
              <AssignmentRow key={r.assignment.id} a={r.assignment} tz={tz} now={now}
                extra={<Badge tone={isAdvertisedAsAvailable(r.view) ? 'good' : r.view === 'closed' ? 'muted' : 'warn'}>{RETAKE_LABELS[r.view]}</Badge>} />
            ))}
          </ul>
        </Card>
      )}

      {!asStudent && (
        <Card title="Send a cheer">
          <form action={sendCheer} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="childId" value={childId} />
            <label className="sr-only" htmlFor="cheer">Message</label>
            <input id="cheer" name="message" className="input" maxLength={200} required defaultValue="Proud of the effort you're putting in this week!" />
            <button className="btn-primary whitespace-nowrap">Send in-app</button>
          </form>
          <p className="mt-2 text-xs text-muted">Positive notes only. They show up on the student&apos;s page.</p>
        </Card>
      )}
    </div>
  );
}
