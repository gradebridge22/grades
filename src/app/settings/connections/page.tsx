import { requireParent } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { listChildren } from '@/lib/data/queries';
import { connectionFreshness, relTime } from '@/lib/view';
import { FRESHNESS_LABEL } from '@/lib/domain/sync';
import { ASSIGNMENT_TEMPLATE, GRADE_TEMPLATE } from '@/lib/domain/csv';
import { importCsv, connectCanvas, syncNow, createPairingCode, revokeExtension } from '@/app/actions';
import { Badge, Card, PageHeader, StatusLabel } from '@/components/ui';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function Connections({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireParent();
  const db = await getDb();
  const kids = await listChildren(db, me.userId);
  const conns = await db.asUser(me.userId, (q) => q<Row>(`select c.*, ch.display_name child from integration_connections c left join children ch on ch.id = c.child_id order by c.created_at`));
  const runs = await db.asUser(me.userId, (q) => q<Row>(`select r.*, c.display_name from sync_runs r join integration_connections c on c.id = r.connection_id order by started_at desc limit 8`));
  const canEncrypt = !!process.env.TOKEN_ENCRYPTION_KEY;
  const devices = await db.asUser(me.userId, (q) => q<Row>(`select t.id, t.label, t.created_at, t.last_used_at, t.revoked_at, c.provider, ch.display_name child
      from extension_tokens t join integration_connections c on c.id = t.connection_id join children ch on ch.id = t.child_id order by t.created_at desc`));
  return (
    <div className="grid gap-4">
      <PageHeader title="Connections & sync health" sub="OnTrack Grades never asks for or stores school passwords and never bypasses MFA, captchas or school restrictions." />
      {sp.imported && <div className="rounded-lg bg-brand-soft p-3 text-sm text-brand">Imported {sp.imported} rows.{sp.errors && <pre className="mt-2 whitespace-pre-wrap text-xs text-warn">{sp.errors}</pre>}</div>}
      {sp.synced && <p className="rounded-lg bg-[#f3eee2] p-2 text-sm">Sync attempted — see status below.</p>}

      <Card title="Connections">
        <ul className="divide-y divide-line">
          {conns.map((c) => {
            const f = connectionFreshness(c);
            return (
              <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{c.display_name} <span className="text-xs font-normal text-muted">· {c.child ?? 'family'}</span></div>
                  <div className="text-xs text-muted">Last success {relTime(c.last_success_at)} · last attempt {relTime(c.last_attempt_at)}</div>
                  {c.last_error && <div className="text-xs text-warn">{c.last_error}</div>}
                  {c.not_refreshed && <div className="text-xs text-warn">{c.not_refreshed}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={f === 'current' || ['csv', 'manual'].includes(c.provider) ? 'good' : f === 'not_connected' ? 'muted' : 'warn'}>{c.status === 'pending_district' ? 'Waiting for district API' : ['csv', 'manual'].includes(c.provider) ? `Manual import · ${relTime(c.last_success_at)}` : FRESHNESS_LABEL[f]}</Badge>
                  {c.provider === 'canvas' && <form action={syncNow}><input type="hidden" name="connectionId" value={c.id} /><button className="btn-ghost">{c.status === 'reconnect_needed' ? 'Retry' : 'Sync now'}</button></form>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>


      <Card title={<span id="extension">Browser extension <StatusLabel kind="implemented" /></span>}>
        <p className="text-sm text-muted">You sign in to Canvas or Skyward Family Access <strong className="text-ink">yourself</strong>, in your own browser. When you press Sync, the OnTrack Grades extension reads the grade and assignment pages you can already see and sends only that data here. Your school password never leaves your browser, and nothing syncs unless you press the button.</p>
        {sp.pair && (
          <div className="my-3 rounded-lg border border-[#cfe7e0] bg-brand-soft p-3 text-center">
            <div className="text-xs font-medium text-brand">Pairing code for {sp.provider === 'skyward' ? 'Skyward' : 'Canvas'} · expires in 10 minutes</div>
            <div className="nums mt-1 text-3xl tracking-[0.2em] text-ink">{sp.pair}</div>
            <div className="mt-1 text-xs text-muted">Type it into the extension popup. It works once.</div>
          </div>
        )}
        <form action={createPairingCode} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Child</span><select name="childId" className="input">{kids.map((k) => <option key={k.id} value={k.id}>{k.display_name}</option>)}</select></label>
          <label><span className="label">School system</span><select name="provider" className="input"><option value="canvas">Canvas</option><option value="skyward">Skyward Family Access</option></select></label>
          <button className="btn-primary self-end">Get pairing code</button>
        </form>
        {devices.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span>{d.label} · {d.provider} · {d.child}<span className="block text-xs text-muted">Paired {relTime(d.created_at)} · last sync {relTime(d.last_used_at)}</span></span>
                {d.revoked_at ? <span className="text-xs text-muted">Revoked</span> : (
                  <form action={revokeExtension}><input type="hidden" name="id" value={d.id} /><button className="btn-ghost">Revoke</button></form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={<>CSV import <StatusLabel kind="implemented" /></>}>
        <form action={importCsv} className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Child</span><select name="childId" className="input">{kids.map((k) => <option key={k.id} value={k.id}>{k.display_name}</option>)}</select></label>
          <label><span className="label">File type</span><select name="kind" className="input"><option value="grades">Grades</option><option value="assignments">Assignments</option></select></label>
          <label><span className="label">CSV file</span><input type="file" name="file" accept=".csv,text/csv" className="input" /></label>
          <label className="sm:col-span-3"><span className="label">…or paste CSV</span><textarea name="text" className="input h-24 font-mono text-xs" /></label>
          <button className="btn-primary w-fit">Import</button>
        </form>
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-link">Templates (tip: export from Skyward Family Access, then match these columns)</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-[#f3eee2] p-2">{GRADE_TEMPLATE}</pre>
          <pre className="mt-2 overflow-x-auto rounded bg-[#f3eee2] p-2">{ASSIGNMENT_TEMPLATE}</pre>
          <p className="mt-1 text-muted">attempts_allowed may be a number, “unlimited”, or blank (= unknown). Re-importing the same rows updates them; parent dismissals are kept.</p>
        </details>
      </Card>

      <Card title={<>Canvas <StatusLabel kind="waiting" /></>}>
        <p className="text-sm text-muted">Uses Canvas&apos;s documented REST API in read-only mode. Best option: a <strong>parent observer account</strong> paired to your student; then create an access token from the observer account (Account → Settings → New access token), if your district allows it. Districts can instead issue an OAuth developer key.</p>
        {canEncrypt ? (
          <form action={connectCanvas} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><span className="label">Child</span><select name="childId" className="input">{kids.map((k) => <option key={k.id} value={k.id}>{k.display_name}</option>)}</select></label>
            <label><span className="label">Canvas URL</span><input name="baseUrl" placeholder="https://yourdistrict.instructure.com" className="input" required /></label>
            <label><span className="label">Student&apos;s Canvas user ID (from observer view)</span><input name="studentCanvasId" inputMode="numeric" className="input" required /></label>
            <label><span className="label">Observer access token</span><input name="token" type="password" autoComplete="off" className="input" required /></label>
            <button className="btn-primary w-fit">Connect (token is encrypted server-side)</button>
          </form>
        ) : <p className="mt-2 text-xs text-warn">Set TOKEN_ENCRYPTION_KEY on the server to enable connecting Canvas.</p>}
      </Card>

      <Card title={<>Skyward <StatusLabel kind="waiting" /></>}>
        <p className="text-sm text-muted">Skyward has no universal parent API. A direct server connection needs your district to enable an approved interface (such as OneRoster). Until then, use the browser extension above while signed in to Family Access, or CSV import.</p>
      </Card>

      <Card title="Recent sync runs">
        <ul className="divide-y divide-line text-xs">
          {runs.length === 0 && <li className="py-2 text-muted">No runs yet.</li>}
          {runs.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.display_name}: {r.outcome}{r.message ? ` — ${r.message}` : ''}</span><span className="text-muted">{relTime(r.started_at)} · {r.items_upserted} items</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
