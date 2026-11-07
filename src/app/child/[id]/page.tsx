import { notFound } from 'next/navigation';
import { requireParent } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs } from '@/lib/data/queries';
import { ChildDashboard } from '@/components/ChildDashboard';
import { PageHeader } from '@/components/ui';

export default async function ChildPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const me = await requireParent();
  const db = await getDb();
  const cd = await getChildData(db, me.userId, id, me.calendar.timezone).catch(() => null);
  if (!cd) notFound(); // RLS: other families' children simply don't exist for this user
  const { rule } = await getPrefs(db, me);
  return (
    <div>
      <PageHeader title={cd.child.display_name} sub={cd.child.grade_level ? `Grade ${cd.child.grade_level}` : undefined} back={{ href: '/parent', label: 'Family' }} />
      {sp.cheer === 'sent' && <p className="mb-3 rounded-lg bg-brand-soft p-2 text-sm text-brand">Cheer sent.</p>}
      {sp.cheer === 'nologin' && <p className="mb-3 rounded-lg bg-warn-soft p-2 text-sm text-warn">This child doesn&apos;t have a student login yet — invite them from Family setup.</p>}
      <ChildDashboard cd={cd} me={me} rule={rule} asStudent={false} />
    </div>
  );
}
