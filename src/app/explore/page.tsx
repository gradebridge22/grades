import Link from 'next/link';
import { requireParent } from '@/lib/auth/session';
import { CATALOG, TOPICS, affiliateEnabled } from '@/lib/explore';
import { Badge, Card, PageHeader, StatusLabel } from '@/components/ui';

export default async function Explore({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireParent(); // parent-only: nothing here is shown to students
  const sp = await searchParams;
  const picked = (sp.t ?? '').split(',').filter((t) => (TOPICS as readonly string[]).includes(t));
  const items = picked.length ? CATALOG.filter((c) => picked.includes(c.topic)) : CATALOG;
  const aff = affiliateEnabled();
  const toggle = (t: string) => { const s = new Set(picked); s.has(t) ? s.delete(t) : s.add(t); return `/explore${s.size ? `?t=${[...s].join(',')}` : ''}`; };
  return (
    <div className="grid gap-4">
      <PageHeader title="Explore interests" sub={<>Ideas beyond school, picked by interest you choose — never based on grades. <StatusLabel kind="mocked" /></>} />
      <div className="flex flex-wrap gap-2">
        {TOPICS.map((t) => <Link key={t} href={toggle(t)} className={`rounded-full border px-3 py-1 text-sm ${picked.includes(t) ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}>{t}</Link>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((c) => (
          <Card key={c.id} title={c.title} action={<Badge tone={c.cost === 'Free' ? 'good' : 'neutral'}>{c.cost}</Badge>}>
            <p className="text-sm text-muted">{c.topic} · {c.format} · ages {c.ages}</p>
            <p className="text-xs text-muted">{c.provider}</p>
            {c.affiliateUrl && aff ? (
              <div className="mt-2"><a href={c.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer" className="text-sm text-link underline">Learn more</a>
                <p className="mt-1 text-[11px] text-muted">Paid link — we may earn a commission. No family data is shared.</p></div>
            ) : c.affiliateUrl ? <p className="mt-2 text-[11px] text-muted">Partner links are turned off.</p> : null}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">Suggestions are not personalized from school records. Turn on partner links with AFFILIATE_LINKS_ENABLED=true only after joining real affiliate programs and completing a privacy review.</p>
    </div>
  );
}
