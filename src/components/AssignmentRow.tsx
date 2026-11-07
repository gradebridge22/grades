import Link from 'next/link';
import { Badge, type Tone } from './ui';
import type { Assignment, Reply } from '@/lib/domain/types';
import { REPLY_LABELS } from '@/lib/domain/types';
import { classify, scorePct } from '@/lib/domain/assignments';
import { BUCKET_LABEL, fmtDate, relTime } from '@/lib/view';
import { courseColor } from '@/lib/courseColor';

const TONE: Record<string, Tone> = { upcoming: 'info', overdue: 'warn', missing: 'bad', submitted_ungraded: 'neutral', low_score: 'warn', graded: 'good', excused: 'muted', no_date: 'muted' };

export function AssignmentRow({ a, reply, tz, now = new Date(), extra, stripe = true }: { a: Assignment; reply?: Reply | null; tz: string; now?: Date; extra?: React.ReactNode; stripe?: boolean }) {
  const b = classify(a, now);
  const pct = scorePct(a);
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/assignment/${a.id}`} className="group flex gap-3 py-3">
        {stripe && <span aria-hidden className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: courseColor(a.courseName ?? a.courseId) }} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium group-hover:underline">{a.title}</div>
            <div className="text-xs text-muted">
              <span className="font-medium text-[#4a4f57]">{a.courseName}</span>
              {a.teacher ? ` · ${a.teacher}` : ''} · due <span className="nums">{fmtDate(a.dueAt, tz)}</span>{a.closesAt ? <> · closes <span className="nums">{fmtDate(a.closesAt, tz)}</span></> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {pct != null && <span className="nums text-sm">{a.score}/{a.pointsPossible}</span>}
            <Badge tone={TONE[b]}>{BUCKET_LABEL[b]}</Badge>
            {a.plannerChecked && b !== 'graded' && b !== 'submitted_ungraded' && <Badge tone="muted">Planner ✓ — not a submission</Badge>}
            {reply && <Badge tone="info">{REPLY_LABELS[reply.status]} · {relTime(reply.createdAt, now)}</Badge>}
            {extra}
          </div>
        </div>
      </Link>
    </li>
  );
}
