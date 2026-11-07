import { requireParent } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { deleteFamily, saveRetention } from '@/app/actions';
import { Card, PageHeader } from '@/components/ui';
import { relTime } from '@/lib/view';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function Privacy({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireParent();
  const db = await getDb();
  const [f] = await db.asUser(me.userId, (q) => q<Row>(`select * from families where id = $1`, [me.familyId]));
  const audit = await db.asUser(me.userId, (q) => q<Row>(`select a.*, m.display_name from audit_log a left join family_members m on m.user_id = a.actor_user_id and m.family_id = a.family_id order by at desc limit 25`));
  return (
    <div className="grid gap-4">
      <PageHeader title="Privacy, export & deletion" />
      {sp.saved && <p className="rounded-lg bg-brand-soft p-2 text-sm text-brand">Saved.</p>}
      <Card title="Our commitments">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>No ads. No sale of student data. No AI training on family data.</li>
          <li>Each family&apos;s data is isolated by database row-level security; students see only their own work.</li>
          <li>We never collect school passwords. Integration tokens are encrypted and readable only by the server.</li>
          <li>Every reply, dismissal, connection change and export is audit-logged.</li>
        </ul>
      </Card>
      <Card title="Export">
        <p className="mb-2 text-sm text-muted">Download everything stored about your family as JSON (secrets excluded).</p>
        <a href="/api/export" className="btn-ghost">Download family export</a>
      </Card>
      <Card title="Retention">
        <form action={saveRetention} className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Keep replies (days)</span><input name="replies" type="number" min={30} max={3650} defaultValue={f.retention_replies_days} className="input" /></label>
          <label><span className="label">Keep notifications (days)</span><input name="notifications" type="number" min={7} max={3650} defaultValue={f.retention_notifications_days} className="input" /></label>
          <button className="btn-ghost self-end">Save</button>
        </form>
      </Card>
      <Card title="Audit log">
        <ul className="divide-y divide-line text-xs">
          {audit.map((a) => <li key={a.id} className="flex justify-between gap-2 py-1.5"><span>{a.display_name ?? 'System'} · {a.action} {a.entity}{a.detail?.reason ? ` — “${a.detail.reason}”` : ''}{a.detail?.status ? ` (${a.detail.status})` : ''}</span><span className="whitespace-nowrap text-muted">{relTime(a.at)}</span></li>)}
        </ul>
      </Card>
      <Card title="Delete family" className="border-[#8f2d2d]/30">
        {sp.err && <p className="mb-2 text-sm text-[#8f2d2d]">Name didn&apos;t match.</p>}
        <form action={deleteFamily} className="grid gap-2">
          <p className="text-sm text-muted">Permanently deletes all children, grades, assignments, replies, notifications and connections. This cannot be undone. Export first if you want a copy.</p>
          <label><span className="label">Type the family name to confirm: {f.name}</span><input name="confirmName" required className="input" /></label>
          <button className="btn-danger w-fit">Delete everything</button>
        </form>
      </Card>
    </div>
  );
}
