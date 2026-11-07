import Link from 'next/link';
import { requireParent } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs, listChildren } from '@/lib/data/queries';
import { summarize, relTime } from '@/lib/view';
import { praise } from '@/lib/domain/encouragement';
import { isAdvertisedAsAvailable } from '@/lib/domain/retakes';
import { Card, PageHeader, Tally, Praise, Stamp } from '@/components/ui';

export default async function ParentDashboard() {
  const me = await requireParent();
  const db = await getDb();
  const { rule } = await getPrefs(db, me);
  const kids = await listChildren(db, me.userId);
  const now = new Date();
  const data = await Promise.all(kids.map(async (k) => {
    const cd = (await getChildData(db, me.userId, k.id, me.calendar.timezone))!;
    return { k, cd, s: summarize(cd, me.calendar, rule, now) };
  }));
  const stale = data.flatMap((d) => d.s.stale.map((c: Record<string, string>) => ({ ...c, child: d.k.display_name }) as Record<string, string>));
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow={`${me.familyName} · ${me.calendar.timezone}`} title={`Hi, ${me.displayName.split(' ').slice(-1)[0]}.`} />
      {stale.map((c) => (
        <Stamp key={c.id}>
          <strong>{c.display_name}: reconnect needed.</strong> Last good refresh {relTime(c.last_success_at, now)}. {c.not_refreshed}{' '}
          <Link href="/settings/connections" className="font-semibold underline">Reconnect</Link>
        </Stamp>
      ))}
      {data.map(({ k, cd, s }) => {
        const openRetakes = s.retakes.filter((r) => isAdvertisedAsAvailable(r.view)).length;
        return (
          <Card key={k.id} title={<Link href={`/child/${k.id}`} className="text-lg hover:underline">{k.display_name}</Link>}
            action={<div className="flex gap-2 text-sm"><Link className="text-link hover:underline" href={`/child/${k.id}/grades`}>Grades</Link><Link className="text-link hover:underline" href={`/child/${k.id}/assignments`}>Assignments</Link></div>}>
            <div className="text-xs text-muted">{cd.scope.current ? `Current period: ${cd.scope.current.name}` : 'No grading period configured'}</div>
            <div className="mt-3"><Tally items={[
              { label: 'overdue', value: s.buckets.overdue.length, tone: s.buckets.overdue.length ? 'warn' : 'neutral', href: `/child/${k.id}/assignments#overdue` },
              { label: 'missing', value: s.buckets.missing.length, tone: s.buckets.missing.length ? 'bad' : 'neutral', href: `/child/${k.id}/assignments#missing` },
              { label: 'awaiting', value: s.buckets.submitted_ungraded.length, href: `/child/${k.id}/assignments#submitted_ungraded` },
              { label: 'ask teacher', value: s.followUps.length, tone: s.followUps.length ? 'info' : 'neutral', href: '/follow-up' },
              { label: 'retakes', value: openRetakes, tone: openRetakes ? 'good' : 'neutral', href: `/child/${k.id}/assignments#retakes` },
            ]} /></div>
            {s.improvements.length > 0 && (
              <div className="mt-3">{s.improvements.map((i) => <Praise key={i.course}>{praise(i, k.id + i.course)}</Praise>)}</div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/child/${k.id}`} className="btn-primary">Open {k.display_name.split(' ')[0]}&apos;s dashboard</Link>
              {s.buckets.upcoming.length > 0 && <span className="self-center text-xs text-muted">{s.buckets.upcoming.length} upcoming</span>}
            </div>
          </Card>
        );
      })}
      {kids.length === 0 && <Card><p className="text-sm">No children yet. <Link href="/onboarding" className="text-link underline">Add one</Link></p></Card>}
    </div>
  );
}
