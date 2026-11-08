import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getMe, getPrefs, listChildren } from '@/lib/data/queries';
import { createFamily, saveConsent, inviteMember } from '../actions';
import { Card, PageHeader } from '@/components/ui';
import { CONSENT_TEXT } from '@/lib/consent';

const TZS = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'];

export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const uid = await currentUserId(); if (!uid) redirect('/login');
  const db = await getDb();
  const me = await getMe(db, uid);
  if (!me) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Set up your family" sub="Step 1 of 2 · Only you and people you invite can see your family's data." />
        <Card>
          <form action={createFamily} className="grid gap-4">
            <label><span className="label">Your name (as your kids see it)</span><input name="displayName" required className="input" maxLength={60} /></label>
            <label><span className="label">Family name</span><input name="familyName" required className="input" maxLength={80} placeholder="The Garcia family" /></label>
            <label><span className="label">Time zone</span><select name="timezone" className="input">{TZS.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label><span className="label">Children (first names or nicknames, comma-separated)</span><input name="children" className="input" placeholder="Mia, Leo" />
              <span className="mt-1 block text-xs text-muted">Data minimization: a first name or nickname is enough. We never need birthdates or student ID numbers.</span></label>
            <button className="btn-primary">Continue</button>
          </form>
        </Card>
      </div>
    );
  }
  const prefs = await getPrefs(db, me);
  const kids = me.role === 'student' ? [] : await listChildren(db, uid);
  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <PageHeader title={me.onboarded ? 'Family setup' : 'Notification consent'} sub={me.onboarded ? me.familyName : 'Step 2 of 2'} />
      <Card title="Automated messages">
        <form action={saveConsent} className="grid gap-3">
          <p className="rounded-lg bg-[#f3eee2] p-3 text-sm">{CONSENT_TEXT}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="in_app" defaultChecked={prefs.consents.has('in_app') || !me.onboarded} /> In-app notifications</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={prefs.consents.has('email')} /> Email</label>
          <p className="text-xs text-muted">Push notifications are planned for a later phase. Nothing is sent on a channel you haven&apos;t checked.</p>
          <button className="btn-primary">{me.onboarded ? 'Save consent' : 'Finish setup'}</button>
        </form>
      </Card>
      {me.role !== 'student' && (
        <Card title="Invite a parent, guardian or student">
          {sp.invited && (sp.unsent
            ? <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">We couldn&apos;t email {sp.invited} yet. Send them this invite link yourself (text or email). It works once and expires in 7 days:<br /><span className="break-all text-xs font-mono select-all">{sp.link}</span></p>
            : <p className="mb-3 rounded-lg bg-brand-soft p-2 text-sm text-brand">Invite sent to {sp.invited}.{sp.link && <><br /><span className="break-all text-xs">Demo link (normally only emailed): {sp.link}</span></>}</p>)}
          <form action={inviteMember} className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Email</span><input name="email" type="email" required className="input" /></label>
            <label><span className="label">Role</span><select name="role" className="input"><option value="guardian">Guardian</option><option value="parent">Parent</option><option value="student">Student</option></select></label>
            <label><span className="label">Student account for</span><select name="childId" className="input"><option value="">—</option>{kids.map((k) => <option key={k.id} value={k.id}>{k.display_name}</option>)}</select></label>
            <button className="btn-ghost sm:col-span-2">Send invite (expires in 7 days)</button>
          </form>
        </Card>
      )}
    </div>
  );
}
