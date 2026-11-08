import { signInWithPassword } from './actions';
import { Card } from '@/components/ui';

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md pt-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in with password</h1>
      <Card title="Sign in" className="mt-6">
        {sp.error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Email or password is incorrect.</p>}
        <form action={signInWithPassword} className="grid gap-3">
          <label><span className="label">Email</span><input name="email" type="email" required className="input" autoComplete="email" /></label>
          <label><span className="label">Password</span><input name="password" type="password" required minLength={6} className="input" autoComplete="current-password" /></label>
          <button className="btn-primary">Sign in</button>
          <p className="text-xs text-muted"><a href="/login" className="underline">Use an email link instead</a></p>
        </form>
      </Card>
    </div>
  );
}
