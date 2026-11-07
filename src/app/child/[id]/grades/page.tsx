import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData } from '@/lib/data/queries';
import { gradesTable, fmtDate, relTime, type GradeCell } from '@/lib/view';
import { FRESHNESS_LABEL } from '@/lib/domain/sync';
import { Badge, Card, PageHeader, Sparkline } from '@/components/ui';
import { courseColor } from '@/lib/courseColor';

function Cell({ c, tz }: { c: GradeCell | null; tz: string }) {
  if (!c) return <span className="text-xs text-muted">No grade posted</span>;
  const tone = c.freshness === 'current' || c.freshness === 'manual' ? 'muted' : 'warn';
  return (
    <div className="leading-tight">
      <div className="nums text-[15px]">{c.percent != null ? `${c.percent}%` : '—'}{c.letter ? <span className="ml-1 text-muted">{c.letter}</span> : null}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        <Badge tone={c.status === 'final' ? 'good' : 'neutral'}>{c.status === 'final' ? 'Final' : 'Provisional'}</Badge>
        <Badge tone={tone}>{c.source.toUpperCase()} · {fmtDate(c.recordedAt, tz)}{c.freshness !== 'manual' && c.freshness !== 'current' ? ` · ${FRESHNESS_LABEL[c.freshness]}` : ''}</Badge>
      </div>
    </div>
  );
}

export default async function Grades({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const cd = await getChildData(await getDb(), me.userId, id, me.calendar.timezone).catch(() => null);
  if (!cd) notFound();
  const rows = gradesTable(cd);
  const tz = me.calendar.timezone;
  return (
    <div className="grid gap-4">
      <PageHeader title={`${cd.child.display_name} · All courses`} back={{ href: me.role === 'student' ? '/student' : `/child/${id}`, label: 'Back' }}
        sub={<>Official = school information system (e.g. Skyward). Platform = learning platform (e.g. Canvas). Values are shown exactly as last received; nothing is estimated.</>} />
      <div className="flex flex-wrap gap-2 text-xs">
        {cd.connections.map((c: Record<string, string>) => (
          <Badge key={c.id} tone={c.status === 'connected' ? 'good' : c.status === 'reconnect_needed' ? 'warn' : 'muted'}>
            {c.display_name}: {c.status.replace('_', ' ')} · last success {relTime(c.last_success_at)}
          </Badge>
        ))}
      </div>
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-[#fafaf8] text-xs font-medium text-muted">
            <tr><th className="p-3">Course</th><th className="p-3">{cd.scope.current?.name ?? 'Current'} · official</th><th className="p-3">{cd.scope.current?.name ?? 'Current'} · platform</th>
              <th className="p-3">Semester</th><th className="p-3">Last report card</th><th className="p-3">Trend</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.course.id} className="align-top">
                <td className="p-3"><div className="flex items-start gap-2.5"><span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: courseColor(r.course.name) }} /><div><div className="font-medium">{r.course.name}</div><div className="text-xs text-muted">{r.teacher ?? 'Teacher unknown'}</div>
                  {!r.hasAnyGrade && <Badge tone="muted">No grades posted yet</Badge>}</div></div></td>
                <td className="p-3"><Cell c={r.officialQuarter} tz={tz} /></td>
                <td className="p-3"><Cell c={r.platformQuarter} tz={tz} /></td>
                <td className="p-3"><Cell c={r.semester} tz={tz} /></td>
                <td className="p-3"><Cell c={r.lastReportCard} tz={tz} /></td>
                <td className="p-3">
                  <Sparkline points={r.trendPoints} />
                  {r.trend != null ? <div className={`nums text-xs ${r.trend >= 0 ? 'text-good' : 'text-warn'}`}>{r.trend >= 0 ? '+' : ''}{r.trend.toFixed(1)}</div>
                    : <div className="text-xs text-muted">Not enough data</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
