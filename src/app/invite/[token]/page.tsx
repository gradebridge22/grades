import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth/session';
import { acceptInvite } from '../../actions';
import { Card, PageHeader } from '@/components/ui';

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await currentUserId())) redirect(`/login?next=/invite/${token}`);
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Join a family" />
      <Card>
        {/* Accepting requires an explicit POST; opening the link does nothing. */}
        <form action={acceptInvite} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          <label><span className="label">Your name</span><input name="displayName" className="input" required /></label>
          <button className="btn-primary">Accept invite</button>
        </form>
      </Card>
    </div>
  );
}
