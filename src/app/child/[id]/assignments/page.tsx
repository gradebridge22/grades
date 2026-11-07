import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs } from '@/lib/data/queries';
import { summarize, BUCKET_LABEL } from '@/lib/view';
import { RETAKE_LABELS, attemptsText, isAdvertisedAsAvailable } from '@/lib/domain/retakes';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { AssignmentRow } from '@/components/AssignmentRow';
import { addManualAssignment } from '@/app/actions';
import type { Bucket } from '@/lib/domain/assignments';

const ORDER: Bucket[] = ['overdue', 'missing', 'upcoming', 'submitted_ungraded', 'low_score', 'no_date', 'graded', 'excused'];

export default async function Assignments({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const me = await requireMe();
  const db = await getDb();
  const cd = await getChildData(db, me.userId, id, me.calendar.timezone).catch(() => null);
  if (!cd) notFound();
  const { rule } = await getPrefs(db, me);
  const s = summarize(cd, me.calendar, rule);
  const tz = me.calendar.timezone;
  const isParent = me.role !== 'student';
  return (
    <div className="grid gap-4">
      <PageHeader title={`${cd.child.display_name} · Assignments & retakes`} back={{ href: isParent ? `/child/${id}` : '/student', label: 'Back' }}
        sub={cd.scope.current ? `Showing ${cd.scope.current.name}. Previous-period work is listed separately and kept out of reminders.` : undefined} />
      {sp.added && <p className="rounded-lg bg-brand-soft p-2 text-sm text-brand">Assignment added.</p>}

      <Card title="Retake opportunities" className="scroll-mt-4" action={<span id="retakes" />}>
        {s.retakes.length === 0 ? <Empty>No low or improvable scores found.</Empty> : (
          <ul className="divide-y divide-line">
            {s.retakes.map((r) => (
              <li key={r.assignment.id} className="py-3">
                <ul><AssignmentRow a={r.assignment} tz={tz} extra={<Badge tone={isAdvertisedAsAvailable(r.view) ? 'good' : r.view === 'closed' ? 'muted' : 'warn'}>{RETAKE_LABELS[r.view]}</Badge>} /></ul>
                <div className="text-xs text-muted">Attempts: {attemptsText(r.assignment)}{r.assignment.retakeNote ? ` · ${r.assignment.retakeNote}` : ''}</div>
                {r.advice && <div className="mt-1 text-xs text-muted">💡 {r.advice}</div>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">OnTrack Grades only reads metadata. It never opens, starts or submits a quiz or test.</p>
      </Card>

      {ORDER.map((b) => s.buckets[b].length > 0 && (
        <Card key={b} title={<span id={b}>{BUCKET_LABEL[b]} <span className="text-muted">({s.buckets[b].length})</span></span>}>
          <ul className="divide-y divide-line">{s.buckets[b].map((a) => <AssignmentRow key={a.id} a={a} reply={s.latest(a.id)} tz={tz} />)}</ul>
        </Card>
      ))}

      {s.previous.length > 0 && (
        <Card title={<>Previous grading periods <span className="text-muted">({s.previous.length})</span></>}>
          <p className="mb-2 text-xs text-muted">Not included in reminders. Open one to deliberately include it.</p>
          <ul className="divide-y divide-line">{s.previous.map((a) => <AssignmentRow key={a.id} a={a} tz={tz} />)}</ul>
        </Card>
      )}

      {isParent && cd.exclusions.length > 0 && (
        <Card title="Dismissed by a parent">
          <ul className="divide-y divide-line text-sm">
            {cd.exclusions.map((e: Record<string, string>) => {
              const a = cd.assignments.find((x) => x.id === e.assignment_id);
              return <li key={e.assignment_id} className="py-2"><a href={`/assignment/${e.assignment_id}`} className="font-medium hover:underline">{a?.title}</a><div className="text-xs text-muted">Reason: {e.reason}</div></li>;
            })}
          </ul>
        </Card>
      )}

      {isParent && (
        <Card title="Add an assignment manually">
          <form action={addManualAssignment} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="childId" value={id} />
            <label><span className="label">Course</span><input name="course" required className="input" list="courses" /></label>
            <datalist id="courses">{cd.courses.map((c: Record<string, string>) => <option key={c.id} value={c.name} />)}</datalist>
            <label><span className="label">Title</span><input name="title" required className="input" /></label>
            <label><span className="label">Type</span><select name="kind" className="input"><option>assignment</option><option>quiz</option><option>test</option></select></label>
            <label><span className="label">Due date</span><input name="due" type="date" className="input" /></label>
            <label><span className="label">Points possible</span><input name="points" type="number" min="0" step="any" className="input" /></label>
            <label><span className="label">Teacher</span><input name="teacher" className="input" /></label>
            <label className="sm:col-span-2"><span className="label">Link (https)</span><input name="url" type="url" className="input" /></label>
            <button className="btn-primary sm:col-span-2">Add</button>
          </form>
        </Card>
      )}
    </div>
  );
}
