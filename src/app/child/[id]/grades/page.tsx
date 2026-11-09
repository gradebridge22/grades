import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData } from '@/lib/data/queries';
import { courseOverview, relTime, shortCourse, type QuarterStat } from '@/lib/view';
import { Badge, PageHeader } from '@/components/ui';
import { courseColor } from '@/lib/courseColor';
import { letterFor } from '@/lib/viewPrefs';

const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p * 100)}%`);

function Quarter({ q, label }: { q: QuarterStat | null; label: string }) {
  if (!q) return null;
  return (
    <div className="rounded-xl bg-[#fafaf8] p-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label} · {q.name}</div>
      <div className="nums mt-0.5 text-lg font-semibold">{pct(q.pct)}</div>
      <div className="text-xs text-muted">{q.graded} graded{q.missing ? <> · <span className="font-semibold text-bad">{q.missing} missing</span></> : null}</div>
      <div className="mt-1 text-xs">{q.reportCard != null
        ? <>Report card: <b>{Math.round(q.reportCard)}%{q.reportLetter ? ` ${q.reportLetter}` : ''}</b></>
        : <span className="text-muted">Report card: not imported</span>}</div>
    </div>
  );
}

export default async function Grades({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const cd = await getChildData(await getDb(), me.userId, id, me.calendar.timezone).catch(() => null);
  if (!cd) notFound();
  const rows = courseOverview(cd);
  const hasReportCards = cd.grades.some((g: Record<string, unknown>) => g.source_type === 'official');
  return (
    <div className="grid gap-4">
      <PageHeader title={`${cd.child.display_name} · All courses`} back={{ href: me.role === 'student' ? '/student' : `/child/${id}`, label: 'Back' }}
        sub={<>Lowest grade first. <b>Canvas now</b> is the running grade Canvas shows. Quarter numbers add up the points on graded work due that quarter.</>} />
      <div className="flex flex-wrap gap-2 text-xs">
        {cd.connections.filter((c: Record<string, string>) => c.provider !== 'manual').map((c: Record<string, string>) => (
          <Badge key={c.id} tone={c.status === 'connected' ? 'good' : 'warn'}>{c.display_name} · synced {relTime(c.last_success_at)}</Badge>
        ))}
      </div>
      {!hasReportCards && (
        <div className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
          Official report-card grades come from Skyward, which isn&apos;t connected yet. <Link className="underline" href="/settings/connections">Import from Skyward</Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const color = courseColor(r.name);
          const letter = letterFor(r.canvasNow);
          return (
            <Link key={r.id} href={`/child/${id}/course/${r.id}`} className="notebook-card block p-4 transition hover:shadow-md">
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug">{shortCourse(r.name)}</div>
                  <div className="truncate text-xs text-muted">{r.teacher ?? 'Teacher unknown'}</div>
                </div>
                <div className="text-right">
                  <div className="nums text-2xl font-bold leading-none">{r.canvasNow != null ? `${Math.round(r.canvasNow)}%` : '—'}</div>
                  <div className="text-xs text-muted">{letter ? `${letter} · ` : ''}Canvas now</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Quarter q={r.current} label="This quarter" />
                <Quarter q={r.previous} label="Last quarter" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
