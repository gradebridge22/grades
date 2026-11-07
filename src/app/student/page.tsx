import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs } from '@/lib/data/queries';
import { ChildDashboard } from '@/components/ChildDashboard';
import { Card, PageHeader } from '@/components/ui';
import { markRead } from '../actions';

export default async function StudentHome() {
  const me = await requireMe();
  if (me.role !== 'student' || !me.childId) redirect('/parent');
  const db = await getDb();
  const cd = (await getChildData(db, me.userId, me.childId, me.calendar.timezone))!;
  const { rule } = await getPrefs(db, me);
  const inbox = await db.asUser(me.userId, (q) => q<{ id: string; subject: string; body: string; kind: string }>(
    `select id, subject, body, kind from notifications where recipient_user_id = $1 and channel = 'in_app' and status = 'sent' and read_at is null order by created_at desc limit 5`, [me.userId]));
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow={new Date().toLocaleDateString('en-US', { timeZone: me.calendar.timezone, weekday: 'long', month: 'short', day: 'numeric' })} title={`Hey ${me.displayName.split(' ')[0]}.`} sub="One tap lets your family know where things stand." />
      {inbox.map((n) => (
        <Card key={n.id} title={n.subject} action={<form action={markRead}><input type="hidden" name="id" value={n.id} /><button className="text-xs text-muted">Dismiss</button></form>}>
          <p className="whitespace-pre-line text-sm">{n.body}</p>
        </Card>
      ))}
      <ChildDashboard cd={cd} me={me} rule={rule} asStudent />
    </div>
  );
}
