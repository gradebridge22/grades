import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getPrefs } from '@/lib/data/queries';
import { savePrefs, saveConsent } from '@/app/actions';
import { Card, PageHeader, StatusLabel } from '@/components/ui';
import { CONSENT_TEXT } from '@/lib/consent';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function NotificationSettings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireMe();
  const db = await getDb();
  const { raw: p, consents } = await getPrefs(db, me);
  const isParent = me.role !== 'student';
  const recent = await db.asUser(me.userId, (q) => q<Row>(`select n.kind, n.channel, n.status, n.subject, n.attempts, n.created_at, n.last_error from notifications n
      where n.recipient_user_id = $1 or $2 order by created_at desc limit 15`, [me.userId, isParent]));
  const chk = (name: string, label: string, on: boolean | undefined) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={!!on} /> {label}</label>
  );
  return (
    <div className="grid gap-4">
      <PageHeader title="Notification preferences" sub={<>Email and in-app are <StatusLabel kind="implemented" />. Push is planned for a later phase.</>} />
      {sp.saved && <p className="rounded-lg bg-brand-soft p-2 text-sm text-brand">Saved.</p>}
      <Card title="Consent">
        <form action={saveConsent} className="grid gap-2">
          <input type="hidden" name="next" value="settings" />
          <p className="text-xs text-muted">{CONSENT_TEXT}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="in_app" defaultChecked={consents.has('in_app')} /> I consent to in-app notifications</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={consents.has('email')} /> I consent to automated emails</label>
          <button className="btn-ghost w-fit">Update consent</button>
        </form>
      </Card>
      <form action={savePrefs} className="grid gap-4">
        <Card title="What to send">
          <div className="grid gap-2 sm:grid-cols-2">
            {chk('email_enabled', 'Email channel', p?.email_enabled)}
            {chk('in_app_enabled', 'In-app channel', p?.in_app_enabled)}
            {isParent && chk('daily_summary', 'Daily family summary', p?.daily_summary)}
            {chk('assignment_questions', 'Individual assignment questions', p?.assignment_questions)}
            {chk('reminders', 'Next-school-day reminders', p?.reminders)}
            {isParent && chk('reply_recaps', 'Recap of student replies', p?.reply_recaps)}
          </div>
          {isParent && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label><span className="label">Summary time</span><input type="time" name="summary_time" defaultValue={(p?.st ?? '17:30').slice(0, 5)} className="input" /></label>
              <label><span className="label">Recap mode</span><select name="recap_mode" defaultValue={p?.recap_mode} className="input"><option value="partial">Summarize partial responses</option><option value="wait_all">Wait for all answers</option></select></label>
              <label><span className="label">…but send anyway after (hours)</span><input type="number" name="recap_max_wait_hours" min={1} max={168} defaultValue={p?.recap_max_wait_hours ?? 24} className="input" /></label>
            </div>
          )}
        </Card>
        <Card title="Teacher follow-up rule">
          <p className="mb-2 text-sm text-muted">If a student says an assignment is done but no grade appears after:</p>
          <div className="flex gap-2">
            <input type="number" name="followupValue" min={1} max={336} defaultValue={p?.followup_delay_value ?? 48} className="input w-24" />
            <select name="followupUnit" defaultValue={p?.followup_delay_unit ?? 'hours'} className="input w-40"><option value="hours">hours</option><option value="school_days">school days</option></select>
          </div>
        </Card>
        {isParent && (
          <Card title="Family calendar">
            <div className="grid gap-3 sm:grid-cols-3">
              <label><span className="label">Time zone</span><input name="timezone" defaultValue={me.calendar.timezone} className="input" /></label>
              <label><span className="label">Quiet hours start</span><input type="time" name="quiet_start" defaultValue={me.calendar.quietStart} className="input" /></label>
              <label><span className="label">Quiet hours end</span><input type="time" name="quiet_end" defaultValue={me.calendar.quietEnd} className="input" /></label>
            </div>
            <div className="mt-3"><span className="label">School days</span>
              <div className="flex flex-wrap gap-3">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" name="school_days" value={i + 1} defaultChecked={me.calendar.schoolDays.includes(i + 1)} />{d}</label>)}</div>
            </div>
            <label className="mt-3 block"><span className="label">When a school connection needs reconnecting</span>
              <select name="stale_data_mode" defaultValue={me.staleDataMode} className="input">
                <option value="partial_labeled">Send a clearly labeled partial summary</option><option value="wait">Wait until reconnected</option>
              </select></label>
          </Card>
        )}
        <button className="btn-primary w-fit">Save preferences</button>
      </form>
      <Card title="Delivery log (latest)">
        <ul className="divide-y divide-line text-xs">
          {recent.length === 0 && <li className="py-2 text-muted">No notifications yet. Run the job: POST /api/cron/notifications</li>}
          {recent.map((n, i) => (
            <li key={i} className="flex justify-between gap-2 py-2"><span className="truncate">{n.subject}</span>
              <span className="whitespace-nowrap text-muted">{n.kind} · {n.channel} · {n.status}{n.attempts > 1 ? ` · ${n.attempts} attempts` : ''}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
