/**
 * Notification pipeline (server-only, service role):
 *   plan (pure) -> enqueue (INSERT ... ON CONFLICT (idempotency_key) DO NOTHING) -> send with retries -> delivery_log
 * Re-running any step is safe: duplicate plans collapse on the unique idempotency key,
 * and the sender claims rows atomically so two workers never send the same row.
 */
import type { Db, Q } from '../data/engine';
import { loadChildData } from '../data/queries';
import { planNotifications, nextRetryAt, type FamilySnapshot, type Intent, type Recipient } from '../domain/notifications';
import { signReplyToken } from '../domain/replyTokens';
import type { EmailProvider } from './email';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function buildSnapshot(q: Q, familyId: string, appUrl: string, now: Date): Promise<FamilySnapshot> {
  const [f] = await q<Row>(`select *, quiet_start::text qs, quiet_end::text qe from families where id = $1`, [familyId]);
  const hol = await q<Row>(`select day::text as day from school_holidays where family_id = $1`, [familyId]);
  const members = await q<Row>(`select m.*, p.* , p.summary_time::text st from family_members m
      left join notification_prefs p on p.family_id = m.family_id and p.user_id = m.user_id where m.family_id = $1`, [familyId]);
  const consents = await q<Row>(`select user_id, channel from notification_consents where family_id = $1 and revoked_at is null`, [familyId]);
  const kids = await q<Row>(`select id, display_name from children where family_id = $1`, [familyId]);
  const conns = await q<Row>(`select * from integration_connections where family_id = $1 and status in ('reconnect_needed','error')`, [familyId]);
  const asked = await q<Row>(`select payload->>'assignmentId' aid, min(coalesce(sent_at, created_at)) at from notifications
      where family_id = $1 and kind = 'assignment_question' and status = 'sent' group by 1`, [familyId]);

  const recipients: Recipient[] = members.map((m) => ({
    userId: m.user_id, role: m.role, childId: m.child_id,
    consents: new Set(consents.filter((c) => c.user_id === m.user_id).map((c) => c.channel)),
    prefs: {
      emailEnabled: m.email_enabled ?? false, inAppEnabled: m.in_app_enabled ?? false,
      dailySummary: m.daily_summary ?? false, summaryTime: (m.st ?? '17:30').slice(0, 5),
      assignmentQuestions: m.assignment_questions ?? false, reminders: m.reminders ?? false, replyRecaps: m.reply_recaps ?? false,
      recapMode: m.recap_mode ?? 'partial', recapMaxWaitHours: m.recap_max_wait_hours ?? 24,
      followUp: { value: m.followup_delay_value ?? 48, unit: m.followup_delay_unit ?? 'hours' },
    },
  }));
  const children = [];
  for (const k of kids) {
    const cd = (await loadChildData(q, k.id, f.timezone, now))!;
    children.push({
      childId: k.id, name: k.display_name, assignments: cd.assignments, replies: cd.replies, scope: cd.scope,
      questionsAskedAt: new Map(asked.filter((a) => cd.assignments.some((x) => x.id === a.aid)).map((a) => [a.aid, new Date(a.at)])),
    });
  }
  return {
    familyId, appUrl, staleDataMode: f.stale_data_mode,
    calendar: { timezone: f.timezone, schoolDays: f.school_days, holidays: hol.map((h) => h.day), quietStart: f.qs.slice(0, 5), quietEnd: f.qe.slice(0, 5) },
    staleConnections: conns.map((c) => ({ name: c.display_name, lastSuccessAt: c.last_success_at ? new Date(c.last_success_at) : null, notRefreshed: c.not_refreshed })),
    recipients, children,
  };
}

export async function enqueue(q: Q, intents: Intent[]): Promise<number> {
  let inserted = 0;
  for (const i of intents) {
    const r = await q(`insert into notifications(family_id, recipient_user_id, kind, channel, idempotency_key, subject, body, payload, scheduled_for, next_attempt_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) on conflict (idempotency_key) do nothing returning id`,
      [i.familyId, i.recipientUserId, i.kind, i.channel, i.idempotencyKey, i.subject, i.body, JSON.stringify(i.payload), i.scheduledFor.toISOString()]);
    inserted += r.length;
  }
  return inserted;
}

export async function planAndEnqueue(db: Db, now: Date, appUrl: string, familyId?: string) {
  return db.asService(async (q) => {
    const fams = familyId ? [{ id: familyId }] : await q<Row>(`select id from families where onboarded_at is not null`);
    let planned = 0, inserted = 0;
    for (const f of fams) {
      const snap = await buildSnapshot(q, f.id, appUrl, now);
      const intents = planNotifications(snap, now);
      planned += intents.length;
      inserted += await enqueue(q, intents);
    }
    return { planned, inserted };
  });
}

export async function sendDue(db: Db, email: EmailProvider, now: Date, appUrl: string, limit = 50) {
  // Claim atomically: queued -> sending. FOR UPDATE SKIP LOCKED makes concurrent workers safe.
  const claimed = await db.asService((q) => q<Row>(`update notifications set status = 'sending', attempts = attempts + 1
      where id in (select id from notifications where status = 'queued' and scheduled_for <= $1 and next_attempt_at <= $1
                   order by scheduled_for limit $2 for update skip locked)
      returning *`, [now.toISOString(), limit]));
  const results = { sent: 0, failed: 0, retried: 0 };
  for (const n of claimed) {
    try {
      let providerId: string | null = null;
      if (n.channel === 'email') {
        const [u] = await db.asService((q) => q<Row>(`select email from auth.users where id = $1`, [n.recipient_user_id]));
        if (!u?.email) throw new Error('recipient has no email');
        let body: string = n.body;
        if (n.payload?.replyLink && n.payload?.assignmentId) body += '\n\nReply in one tap: ' + (await createReplyLink(db, n, appUrl, now));
        providerId = await email.send({ to: u.email, subject: n.subject, text: body, idempotencyKey: n.idempotency_key });
      }
      await db.asService(async (q) => {
        await q(`update notifications set status = 'sent', sent_at = $2, last_error = null where id = $1`, [n.id, now.toISOString()]);
        await q(`insert into delivery_log(notification_id, family_id, attempt, outcome, provider_message_id) values ($1,$2,$3,'sent',$4)`, [n.id, n.family_id, n.attempts, providerId]);
      });
      results.sent++;
    } catch (e) {
      const retry = nextRetryAt(n.attempts, now);
      await db.asService(async (q) => {
        await q(`update notifications set status = $2, last_error = $3, next_attempt_at = coalesce($4, next_attempt_at) where id = $1`,
          [n.id, retry ? 'queued' : 'failed', (e as Error).message.slice(0, 500), retry?.toISOString() ?? null]);
        await q(`insert into delivery_log(notification_id, family_id, attempt, outcome, detail) values ($1,$2,$3,'failed',$4)`, [n.id, n.family_id, n.attempts, (e as Error).message.slice(0, 500)]);
      });
      if (retry) results.retried++; else results.failed++;
    }
  }
  return results;
}

async function createReplyLink(db: Db, n: Row, appUrl: string, now: Date) {
  const { token, payload } = signReplyToken({ aid: n.payload.assignmentId, cid: n.payload.childId, fid: n.family_id, uid: n.recipient_user_id, now, ttlHours: 72 });
  await db.asService((q) => q(`insert into reply_links(nonce, family_id, child_id, assignment_id, expires_at) values ($1,$2,$3,$4,$5)`,
    [payload.n, n.family_id, payload.cid, payload.aid, new Date(payload.exp * 1000).toISOString()]));
  return `${appUrl}/r/${token}`;
}
