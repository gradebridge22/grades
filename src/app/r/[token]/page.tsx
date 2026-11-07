import { getDb } from '@/lib/data/db';
import { dbReplyLinkStore } from '@/lib/data/replyLinkStore';
import { handleReplyLink } from '@/lib/domain/replyTokens';
import { REPLY_LABELS, REPLY_STATUSES } from '@/lib/domain/types';
import { nudge } from '@/lib/domain/encouragement';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

/**
 * One-tap reply landing page. Rendering this page (GET) has NO side effects — email scanners and link
 * previews only ever see the buttons. A reply is recorded only by the explicit POST in ./confirm.
 */
export default async function ReplyLanding({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params; const sp = await searchParams;
  const db = await getDb();
  const out = await handleReplyLink({ method: 'GET', token, query: { s: sp.s } }, dbReplyLinkStore(db));
  if (out.kind !== 'render_confirm') return <Shell><p className="text-center">{out.kind === 'error' ? out.message : 'Done.'}</p></Shell>;
  if (sp.done && REPLY_STATUSES.includes(sp.done as never)) {
    return <Shell><div className="text-center"><div className="text-4xl">✅</div><p className="mt-2 font-semibold">Saved: {REPLY_LABELS[sp.done as keyof typeof REPLY_LABELS]}</p><p className="mt-1 text-sm text-muted">{nudge(token)}</p></div></Shell>;
  }
  const [a] = await db.asService((q) => q<{ title: string; course: string }>(`select a.title, c.name course from assignments a join courses c on c.id = a.course_id where a.id = $1`, [out.payload.aid]));
  const action = `/r/${token}/confirm`;
  return (
    <Shell>
      <p className="text-xs uppercase tracking-wide text-muted">{a?.course}</p>
      <h1 className="text-xl font-semibold">{a?.title}</h1>
      <p className="mt-1 text-sm text-muted">Tap one to confirm. Nothing is saved until you tap.</p>
      <div className="mt-4 grid gap-2">
        {REPLY_STATUSES.filter((s) => s !== 'other').map((s) => (
          <form key={s} method="post" action={action}>
            <input type="hidden" name="status" value={s} /><input type="hidden" name="confirm" value="yes" />
            <button className={`w-full rounded-lg border px-4 py-3 text-left text-[15px] font-medium ${out.preselected === s ? 'border-brand bg-brand-soft' : 'border-line bg-white'}`}>{REPLY_LABELS[s]}</button>
          </form>
        ))}
        <form method="post" action={action} className="grid gap-2">
          <input type="hidden" name="status" value="other" /><input type="hidden" name="confirm" value="yes" />
          <textarea name="note" required maxLength={1000} className="input" placeholder="Other reason, or type a reply" />
          <button className="btn-primary">Send reply</button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-6 max-w-sm rounded-md border border-line bg-white p-5">{children}</div>;
}
