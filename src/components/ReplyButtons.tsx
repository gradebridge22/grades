import { submitReply } from '@/app/actions';
import { REPLY_LABELS, REPLY_STATUSES } from '@/lib/domain/types';
import { Icon } from './Icon';

const ICON: Record<string, string> = {
  already_did: 'check', did_on_paper: 'paper', did_at_school: 'school', need_at_school: 'clock', needs_code: 'key', working_on_it: 'pencil', need_help: 'help', other: 'dots',
};

/** One-tap replies. "Did it at school" and "Need to do it at school" are deliberately separate choices. */
export function ReplyButtons({ assignmentId, back }: { assignmentId: string; back?: string; compact?: boolean }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {REPLY_STATUSES.filter((s) => s !== 'other').map((s) => (
          <form key={s} action={submitReply}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="status" value={s} />
            {back && <input type="hidden" name="back" value={back} />}
            <button className={`btn-ghost w-full justify-start text-left `}><Icon name={ICON[s]} />{REPLY_LABELS[s]}</button>
          </form>
        ))}
      </div>
      <form action={submitReply} className="mt-2 flex gap-2">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <input type="hidden" name="status" value="other" />
        {back && <input type="hidden" name="back" value={back} />}
        <label className="sr-only" htmlFor={`note-${assignmentId}`}>Other reason</label>
        <input id={`note-${assignmentId}`} name="note" className="input" placeholder="Other reason, or type a reply…" maxLength={1000} required />
        <button className="btn-primary">Send</button>
      </form>
    </div>
  );
}
