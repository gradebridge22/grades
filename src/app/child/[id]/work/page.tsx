import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getChildData, getPrefs } from '@/lib/data/queries';
import { summarize, shortCourse } from '@/lib/view';
import { WORK_FILTERS, workLists, type WorkFilter } from '@/lib/workLists';
import { Empty, PageHeader } from '@/components/ui';
import { AssignmentRow } from '@/components/AssignmentRow';

export default async function WorkList({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const me = await requireMe();
  const db = await getDb();
  const cd = await getChildData(db, me.userId, id, me.calendar.timezone).catch(() => null);
  if (!cd) notFound();
  const { rule } = await getPrefs(db, me);
  const now = new Date();
  const s = summarize(cd, me.calendar, rule, now);
  const lists = workLists(s);
  const f: WorkFilter = (sp.f && sp.f in WORK_FILTERS ? sp.f : 'open') as WorkFilter;
  const course = sp.course ?? '';
  const items = lists[f].filter((a) => !course || a.courseId === course);
  const back = me.role === 'student' ? '/student' : `/child/${id}`;
  const href = (nf: string, nc = course) => `/child/${id}/work?f=${nf}${nc ? `&course=${nc}` : ''}`;
  return (
    <div className="grid gap-5">
      <PageHeader title={WORK_FILTERS[f].title} sub={WORK_FILTERS[f].sub} back={{ href: back, label: cd.child.display_name }} />
      <nav aria-label="Filters" className="flex flex-wrap gap-2">
        {(Object.keys(WORK_FILTERS) as WorkFilter[]).map((k) => (
          <Link key={k} href={href(k)} aria-current={k === f ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${k === f ? 'bg-ink text-white' : 'border border-line bg-white text-ink hover:bg-[#faf7f0]'}`}>
            {WORK_FILTERS[k].label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${k === f ? 'bg-white/20' : 'bg-[#f1f0ec]'}`}>{lists[k].filter((a) => !course || a.courseId === course).length}</span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Course" className="flex flex-wrap gap-2 text-sm">
        <Link href={href(f, '')} className={`rounded-full px-3 py-1.5 ${!course ? 'bg-brand-soft font-semibold text-brand' : 'text-muted hover:text-ink'}`}>All courses</Link>
        {s.courses.map((c) => (
          <Link key={c.id} href={href(f, c.id)} className={`rounded-full px-3 py-1.5 ${course === c.id ? 'bg-brand-soft font-semibold text-brand' : 'text-muted hover:text-ink'}`}>{shortCourse(c.name)}</Link>
        ))}
      </nav>
      <section className="notebook-card px-4 sm:px-5">
        {items.length === 0 ? <div className="py-5"><Empty>Nothing here. 🎉</Empty></div> : (
          <ul>{items.map((a) => <AssignmentRow key={a.id} a={a} tz={me.calendar.timezone} now={now} reply={s.latest(a.id)} />)}</ul>
        )}
      </section>
    </div>
  );
}
