import { DEMO_MODE, DEMO_USERS } from '@/lib/auth/session';
import { demoLogin, sendMagicLink } from '../actions';
import { Card } from '@/components/ui';

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="text-3xl font-semibold tracking-tight">Support schoolwork, together.</h1>
      <p className="mt-2 text-sm text-muted">One place for grades, assignments, retakes and quick check-ins between students and the adults cheering them on.</p>
      {sp.deleted && <p className="mt-4 rounded-lg bg-brand-soft p-3 text-sm text-brand">Your family&apos;s data was permanently deleted.</p>}
      {DEMO_MODE ? (
        <Card title="Choose a demo account" className="mt-6">
          <p className="mb-3 text-xs text-muted">Synthetic data only. The Oak family is a separate tenant so you can check isolation.</p>
          <div className="grid gap-2">
            {DEMO_USERS.map((u) => (
              <form key={u.id} action={demoLogin}>
                <input type="hidden" name="userId" value={u.id} />
                <button className="btn-ghost w-full justify-between"><span>{u.label}</span><span className="text-xs text-muted">{u.note}</span></button>
              </form>
            ))}
          </div>
        </Card>
      ) : (
        <Card title="Sign in" className="mt-6">
          {sp.sent ? <p className="text-sm">Check your email for a sign-in link.</p> : (
            <form action={sendMagicLink} className="grid gap-3">
              <label><span className="label">Email</span><input name="email" type="email" required className="input" autoComplete="email" /></label>
              <button className="btn-primary">Email me a sign-in link</button>
              <p className="text-xs text-muted">We never ask for school passwords.</p>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
