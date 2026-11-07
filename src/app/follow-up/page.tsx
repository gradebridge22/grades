import Link from 'next/link';
import { requireParent } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs, listChildren } from '@/lib/data/queries';
import { teacherFollowUps } from '@/lib/domain/assignments';
import { fmtDate, relTime } from '@/lib/view';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';

const REASON = { done_but_ungraded: ['Says done · no grade yet', 'info'], needs_code: ['Needs a code', 'warn'], need_help: ['Asked for help', 'warn'] } as const;

export default async function FollowUp() {
  const me = await requireParent();
  const db = await getDb();
  const { rule } = await getPrefs(db, me);
  const kids = await listChildren(db, me.userId);
  const now = new Date();
  const all = (await Promise.all(kids.map(async (k) => {
    const cd = (await getChildData(db, me.userId, k.id, me.calendar.timezone))!;
    return teacherFollowUps(cd.assignments, cd.replies, cd.scope, rule, me.calendar, now).map((f) => ({ ...f, child: k.display_name }));
  }))).flat();
  const byTeacher = new Map<string, typeof all>();
  for (const f of all) { const t = f.assignment.teacher ?? 'Teacher unknown'; byTeacher.set(t, [...(byTeacher.get(t) ?? []), f]); }
  return (
    <div className="grid gap-4">
      <PageHeader title="Needs teacher follow-up" sub={`Items where the student says it's done but no grade appeared after ${rule.value} ${rule.unit.replace('_', ' ')}, or the student needs a code or help. Submitted-but-ungraded work is never treated as missing.`} />
      {all.length === 0 && <Card><Empty>Nothing needs a teacher follow-up right now.</Empty></Card>}
      {[...byTeacher.entries()].map(([teacher, items]) => (
        <Card key={teacher} title={teacher} action={<span className="text-xs text-muted">{items.length} item{items.length > 1 ? 's' : ''}</span>}>
          <ul className="divide-y divide-line">
            {items.map((f) => (
              <li key={f.assignment.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/assignment/${f.assignment.id}`} className="font-medium hover:underline">{f.assignment.title}</Link>
                  <div className="text-xs text-muted">{f.child} · {f.assignment.courseName} · replied {relTime(f.since, now)} ({fmtDate(f.since, me.calendar.timezone, true)})</div>
                </div>
                <Badge tone={REASON[f.reason][1]}>{REASON[f.reason][0]}</Badge>
              </li>
            ))}
          </ul>
          <details className="mt-2 text-sm"><summary className="cursor-pointer text-link">Draft a note to {teacher}</summary>
            <textarea readOnly className="input mt-2 h-32 text-xs" defaultValue={`Hello ${teacher},\n\nCould you help us check on the following?\n${items.map((f) => `- ${f.assignment.title} (${f.assignment.courseName}): ${REASON[f.reason][0].toLowerCase()}`).join('\n')}\n\nThank you!\n${me.displayName}`} />
          </details>
        </Card>
      ))}
    </div>
  );
}
