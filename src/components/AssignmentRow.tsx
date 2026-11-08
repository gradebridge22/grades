import Link from 'next/link';
import { Badge, type Tone } from './ui';
import type { Assignment, Reply } from '@/lib/domain/types';
import { REPLY_LABELS } from '@/lib/domain/types';
import { classify, scorePct } from '@/lib/domain/assignments';
import { BUCKET_LABEL, dueRelative, fmtDate, isOnPaper, pct0, relTime, shortCourse } from '@/lib/view';
import { courseColor } from '@/lib/courseColor';

const TONE: Record<string, Tone> = { upcoming: 'info', overdue: 'warn', missing: 'bad', submitted_ungraded: 'neutral', low_score: 'warn', graded: 'good', excused: 'muted', no_date: 'muted' };
const round1 = (n: number) => Math.round(n * 10) / 10;

export function AssignmentRow({ a, reply, tz, now = new Date(), extra, stripe = true, showCourse = true, hideStatus = false }: {
  a: Assignment; reply?: Reply | null; tz: string; now?: Date; extra?: React.ReactNode; stripe?: boolean; showCourse?: boolean; hideStatus?: boolean;
}) {
  const b = classify(a, now);
  const pct = scorePct(a);
  const rel = b === 'overdue' || b === 'missing' || b === 'upcoming' ? dueRelative(a, tz, now) : null;
  const closed = a.closesAt && a.closesAt.getTime() <= now.getTime();
  const closesSoon = !closed && a.closesAt && a.closesAt.getTime() - now.getTime() < 3 * 86400_000;
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/assignment/${a.id}`} className="group flex gap-3 py-3">
        {stripe && <span aria-hidden className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: courseColor(a.courseName ?? a.courseId) }} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium group-hover:underline">{a.title}</div>
            <div className="text-xs text-muted">
              {showCourse && <><span className="font-medium text-[#4a4f57]">{shortCourse(a.courseName ?? '')}</span> · </>}
              due <span className="nums">{fmtDate(a.dueAt, tz, false, now)}</span>
              {rel && <> · <span className={b === 'upcoming' ? '' : 'font-medium text-warn'}>{rel}</span></>}
              {a.closesAt && (b === 'overdue' || b === 'upcoming') && <> · <span className={closesSoon ? 'font-medium text-bad' : ''}>closes {fmtDate(a.closesAt, tz, false, now)}</span></>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {pct != null && <span className="nums text-sm"><span className="font-semibold">{pct0(pct)}%</span> <span className="text-xs text-muted">{round1(a.score!)}/{a.pointsPossible}</span></span>}
            {!hideStatus && <Badge tone={TONE[b]}>{b === 'missing' && closed ? 'Missing · closed' : BUCKET_LABEL[b]}</Badge>}
            {isOnPaper(a.title) && (b === 'overdue' || b === 'missing') && <Badge tone="muted">On paper — Canvas can&apos;t see it</Badge>}
            {a.plannerChecked && b !== 'graded' && b !== 'submitted_ungraded' && <Badge tone="muted">Planner ✓ — not a submission</Badge>}
            {reply && <Badge tone="info">{REPLY_LABELS[reply.status]} · {relTime(reply.createdAt, now)}</Badge>}
            {extra}
          </div>
        </div>
      </Link>
    </li>
  );
}
