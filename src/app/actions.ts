'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/data/db';
import { addReply, excludeAssignment, includePreviousPeriod } from '@/lib/data/queries';
import { DEMO_MODE, clearSession, currentUserId, requireMe, requireParent, setDemoSession } from '@/lib/auth/session';
import { isReplyStatus } from '@/lib/domain/replyTokens';
import { parseTyped, gradeRow, assignmentRow } from '@/lib/domain/csv';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { canvasAdapter } from '@/lib/integrations/canvas';
import { normalizeCanvas, syncConnection, canvasCourseScores } from '@/lib/integrations/syncService';
import { defaultEmailProvider } from '@/lib/notifications/email';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const CONSENT_VERSION = 'v1-2026-11';

// ---------- auth ----------
export async function demoLogin(f: FormData) { await setDemoSession(s(f, 'userId')); redirect('/'); }
export async function logout() { await clearSession(); redirect('/login'); }
export async function sendMagicLink(f: FormData) {
  const email = z.string().email().parse(s(f, 'email'));
  const { supabaseServer } = await import('@/lib/auth/supabase');
  await (await supabaseServer()).auth.signInWithOtp({ email, options: { emailRedirectTo: `${process.env.APP_URL}/auth/callback` } });
  redirect('/login?sent=1');
}

// ---------- onboarding ----------
export async function createFamily(f: FormData) {
  const uid = await currentUserId(); if (!uid) redirect('/login');
  const name = z.string().min(1).max(80).parse(s(f, 'familyName'));
  const tz = z.string().min(3).parse(s(f, 'timezone'));
  const me = z.string().min(1).max(60).parse(s(f, 'displayName'));
  const kids = s(f, 'children').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
  await (await getDb()).asUser(uid, async (q) => {
    const [{ fid }] = await q<{ fid: string }>(`select app.create_family($1,$2,$3) fid`, [name, tz, me]);
    for (const k of kids) {
      const [c] = await q<Row>(`insert into children(family_id, display_name) values ($1,$2) returning id`, [fid, k]);
      await q(`insert into grading_periods(family_id, child_id, name, kind, starts_on, ends_on) values ($1,$2,'Current quarter','quarter', current_date - 14, current_date + 60)`, [fid, c.id]);
      await q(`insert into integration_connections(family_id, child_id, provider, status, display_name) values ($1,$2,'manual','connected','Manual entry & CSV')`, [fid, c.id]);
    }
  });
  redirect('/onboarding');
}

export async function saveConsent(f: FormData) {
  const me = await requireMe();
  const want = { email: f.get('email') === 'on', in_app: f.get('in_app') === 'on' };
  await (await getDb()).asUser(me.userId, async (q) => {
    for (const ch of ['email', 'in_app'] as const) {
      const [active] = await q<Row>(`select id from notification_consents where user_id = $1 and family_id = $2 and channel = $3 and revoked_at is null`, [me.userId, me.familyId, ch]);
      if (want[ch] && !active) await q(`insert into notification_consents(family_id, user_id, channel, consent_text_version) values ($1,$2,$3,$4)`, [me.familyId, me.userId, ch, CONSENT_VERSION]);
      if (!want[ch] && active) await q(`update notification_consents set revoked_at = now() where id = $1`, [active.id]);
    }
    if (me.role !== 'student') await q(`update families set onboarded_at = coalesce(onboarded_at, now()) where id = $1`, [me.familyId]);
  });
  revalidatePath('/', 'layout');
  redirect(f.get('next') === 'settings' ? '/settings/notifications?saved=1' : '/');
}

export async function inviteMember(f: FormData) {
  const me = await requireParent();
  const email = z.string().email().parse(s(f, 'email'));
  const role = z.enum(['parent', 'guardian', 'student']).parse(s(f, 'role'));
  const childId = role === 'student' ? z.string().uuid().parse(s(f, 'childId')) : null;
  const token = randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  await (await getDb()).asUser(me.userId, (q) => q(`insert into family_invites(family_id, email, role, child_id, token_hash, expires_at, created_by)
     values ($1,$2,$3,$4,$5, now() + interval '7 days', $6)`, [me.familyId, email, role, childId, hash, me.userId]));
  const link = `${process.env.APP_URL ?? 'http://localhost:3000'}/invite/${token}`;
  let emailed = true;
  try {
    await defaultEmailProvider().send({ to: email, subject: `${me.displayName} invited you to OnTrack Grades`, text: `Accept within 7 days: ${link}`, idempotencyKey: `invite:${hash}` });
  } catch (err) {
    emailed = false; // e.g. email provider not set up for this recipient yet: show the link so the parent can share it directly
    console.error('invite email failed', err);
  }
  const showLink = DEMO_MODE || !emailed;
  redirect(`/onboarding?invited=${encodeURIComponent(email)}${emailed ? '' : '&unsent=1'}${showLink ? `&link=${encodeURIComponent(link)}` : ''}`);
}

// ---------- assignments ----------
export async function submitReply(f: FormData) {
  const me = await requireMe();
  const aid = z.string().uuid().parse(s(f, 'assignmentId'));
  const status = s(f, 'status');
  if (!isReplyStatus(status)) throw new Error('invalid status');
  const note = s(f, 'note').slice(0, 1000) || null;
  if (status === 'other' && !note) redirect(`/assignment/${aid}?err=note`);
  await addReply(await getDb(), me.userId, aid, status, note);
  revalidatePath(`/assignment/${aid}`); revalidatePath('/student');
  redirect(s(f, 'back') || `/assignment/${aid}?saved=1`);
}

export async function dismissAssignment(f: FormData) {
  const me = await requireParent();
  const aid = z.string().uuid().parse(s(f, 'assignmentId'));
  const reason = z.string().min(3, 'Please give a reason').max(500).parse(s(f, 'reason'));
  await excludeAssignment(await getDb(), me.userId, aid, reason);
  revalidatePath('/', 'layout');
  redirect(`/assignment/${aid}?dismissed=1`);
}

export async function restoreAssignment(f: FormData) {
  const me = await requireParent();
  const aid = z.string().uuid().parse(s(f, 'assignmentId'));
  await (await getDb()).asUser(me.userId, (q) => q(`select app.restore_assignment($1)`, [aid]));
  revalidatePath('/', 'layout');
  redirect(`/assignment/${aid}`);
}

export async function toggleInclude(f: FormData) {
  const me = await requireParent();
  const aid = z.string().uuid().parse(s(f, 'assignmentId'));
  await includePreviousPeriod(await getDb(), me.userId, aid, s(f, 'include') === '1');
  revalidatePath('/', 'layout');
  redirect(`/assignment/${aid}`);
}

export async function sendCheer(f: FormData) {
  const me = await requireParent();
  const childId = z.string().uuid().parse(s(f, 'childId'));
  const msg = z.string().min(1).max(200).parse(s(f, 'message'));
  const db = await getDb();
  const [child] = await db.asUser(me.userId, (q) => q<Row>(`select id, user_id from children where id = $1`, [childId])); // RLS check
  if (!child?.user_id) redirect(`/child/${childId}?cheer=nologin`);
  await db.asService((q) => q(`insert into notifications(family_id, recipient_user_id, kind, channel, idempotency_key, subject, body, status, sent_at)
     values ($1,$2,'cheer','in_app',$3,$4,$5,'sent',now()) on conflict do nothing`,
    [me.familyId, child.user_id, `cheer:${me.userId}:${childId}:${Date.now()}`, `A cheer from ${me.displayName}`, msg]));
  redirect(`/child/${childId}?cheer=sent`);
}

export async function markRead(f: FormData) {
  const me = await requireMe();
  await (await getDb()).asUser(me.userId, (q) => q(`update notifications set read_at = now() where id = $1 and recipient_user_id = $2`, [s(f, 'id'), me.userId]));
  revalidatePath('/student');
}

// ---------- settings ----------
export async function savePrefs(f: FormData) {
  const me = await requireMe();
  const b = (k: string) => f.get(k) === 'on';
  const unit = z.enum(['hours', 'school_days']).parse(s(f, 'followupUnit') || 'hours');
  const value = z.coerce.number().int().min(1).max(336).parse(s(f, 'followupValue') || '48');
  await (await getDb()).asUser(me.userId, (q) => q(`insert into notification_prefs(family_id, user_id, email_enabled, in_app_enabled, daily_summary, summary_time,
      assignment_questions, reminders, reply_recaps, recap_mode, recap_max_wait_hours, followup_delay_value, followup_delay_unit)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (family_id, user_id) do update set email_enabled=$3, in_app_enabled=$4, daily_summary=$5, summary_time=$6, assignment_questions=$7,
        reminders=$8, reply_recaps=$9, recap_mode=$10, recap_max_wait_hours=$11, followup_delay_value=$12, followup_delay_unit=$13`,
    [me.familyId, me.userId, b('email_enabled'), b('in_app_enabled'), b('daily_summary'), s(f, 'summary_time') || '17:30', b('assignment_questions'),
     b('reminders'), b('reply_recaps'), z.enum(['wait_all', 'partial']).parse(s(f, 'recap_mode') || 'partial'),
     z.coerce.number().int().min(1).max(168).parse(s(f, 'recap_max_wait_hours') || '24'), value, unit]));
  if (me.role !== 'student') {
    const days = f.getAll('school_days').map(Number).filter((d) => d >= 1 && d <= 7);
    await (await getDb()).asUser(me.userId, (q) => q(`update families set timezone = $2, school_days = $3, quiet_start = $4, quiet_end = $5, stale_data_mode = $6 where id = $1`,
      [me.familyId, s(f, 'timezone') || me.calendar.timezone, days.length ? days : [1, 2, 3, 4, 5], s(f, 'quiet_start') || '21:00', s(f, 'quiet_end') || '07:00',
       z.enum(['partial_labeled', 'wait']).parse(s(f, 'stale_data_mode') || 'partial_labeled')]));
  }
  revalidatePath('/', 'layout');
  redirect('/settings/notifications?saved=1');
}

export async function saveRetention(f: FormData) {
  const me = await requireParent();
  await (await getDb()).asUser(me.userId, (q) => q(`update families set retention_replies_days = $2, retention_notifications_days = $3 where id = $1`,
    [me.familyId, z.coerce.number().int().min(30).max(3650).parse(s(f, 'replies')), z.coerce.number().int().min(7).max(3650).parse(s(f, 'notifications'))]));
  redirect('/settings/privacy?saved=1');
}

export async function deleteFamily(f: FormData) {
  const me = await requireParent();
  await (await getDb()).asUser(me.userId, (q) => q(`select app.delete_family($1, $2)`, [me.familyId, s(f, 'confirmName')]))
    .catch(() => redirect('/settings/privacy?err=confirm'));
  await clearSession();
  redirect('/login?deleted=1');
}

// ---------- data entry ----------
async function findOrCreateCourse(q: (s: string, p?: unknown[]) => Promise<Row[]>, familyId: string, childId: string, name: string, teacher: string | null) {
  const [c] = await q(`select id from courses where child_id = $1 and lower(name) = lower($2) limit 1`, [childId, name]);
  if (c) return c.id as string;
  const [n] = await q(`insert into courses(family_id, child_id, name, teacher, source, external_id) values ($1,$2,$3,$4,'csv',$5) returning id`,
    [familyId, childId, name, teacher, `csv:${name.toLowerCase()}`]);
  return n.id as string;
}

export async function importCsv(f: FormData) {
  const me = await requireParent();
  const childId = z.string().uuid().parse(s(f, 'childId'));
  const kind = z.enum(['grades', 'assignments']).parse(s(f, 'kind'));
  const file = f.get('file');
  const text = file instanceof File && file.size ? await file.text() : s(f, 'text');
  if (text.length > 2_000_000) redirect('/settings/connections?err=too_large');
  const db = await getDb();
  const result = await db.asUser(me.userId, async (q) => {
    const [child] = await q<Row>(`select id, family_id from children where id = $1`, [childId]);
    if (!child) throw new Error('not allowed');
    const periods = await q<Row>(`select id, name, starts_on::text s, ends_on::text e from grading_periods where child_id = $1`, [childId]);
    const byName = (n: string | null) => periods.find((p) => p.name.toLowerCase() === (n ?? '').toLowerCase());
    let ok = 0; const errors: string[] = [];
    if (kind === 'grades') {
      const parsed = parseTyped(text, gradeRow);
      errors.push(...parsed.errors.map((e) => `Line ${e.line}: ${e.message}`));
      for (const r of parsed.rows) {
        const p = byName(r.period);
        if (!p) { errors.push(`"${r.course}": unknown period "${r.period}" (create it first)`); continue; }
        const cid = await findOrCreateCourse(q, child.family_id, childId, r.course, r.teacher);
        await q(`insert into grade_records(family_id, child_id, course_id, period_id, source, source_type, kind, status, percent, letter, recorded_at)
          values ($1,$2,$3,$4,'csv',$5,$6,$7,$8,$9, now()) on conflict (course_id, source, period_id, kind)
          do update set percent = excluded.percent, letter = excluded.letter, status = excluded.status, source_type = excluded.source_type, recorded_at = now()`,
          [child.family_id, childId, cid, p.id, r.source_type, r.kind, r.status, r.percent, r.letter]);
        ok++;
      }
    } else {
      const parsed = parseTyped(text, assignmentRow);
      errors.push(...parsed.errors.map((e) => `Line ${e.line}: ${e.message}`));
      for (const r of parsed.rows) {
        const cid = await findOrCreateCourse(q, child.family_id, childId, r.course, r.teacher);
        const due = r.due ? (r.due.length === 10 ? `${r.due}T23:59` : r.due) : null;
        const p = byName(r.period) ?? (r.due ? periods.find((x) => x.s <= r.due!.slice(0, 10) && r.due!.slice(0, 10) <= x.e) : undefined);
        const ext = r.external_id ?? `csv:${r.course}:${r.title}`.toLowerCase();
        await q(`insert into assignments(family_id, child_id, course_id, period_id, source, external_id, title, kind, teacher, source_url, due_at, closes_at,
            points_possible, score, submission_status, attempts_used, attempts_allowed, attempts_unlimited, retake_status)
          values ($1,$2,$3,$4,'csv',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, case when $7 <> 'assignment' then 'unknown' else 'none' end)
          on conflict (child_id, source, external_id) do update set title = excluded.title, due_at = excluded.due_at, closes_at = excluded.closes_at,
            points_possible = excluded.points_possible, score = excluded.score, submission_status = excluded.submission_status, updated_at = now()`,
          [child.family_id, childId, cid, p?.id ?? null, ext, r.title, r.kind, r.teacher, r.source_url, due, r.closes, r.points_possible, r.score,
           r.submission_status, r.attempts_used, r.attempts_allowed === 'unlimited' ? null : r.attempts_allowed, r.attempts_allowed === 'unlimited']);
        ok++;
      }
    }
    await q(`update integration_connections set last_attempt_at = now(), last_success_at = now(), status = 'connected' where child_id = $1 and provider in ('csv','manual')`, [childId]);
    return { ok, errors };
  });
  const qs = new URLSearchParams({ imported: String(result.ok), errors: result.errors.slice(0, 20).join('\n') });
  redirect(`/settings/connections?${qs}`);
}

export async function addManualAssignment(f: FormData) {
  const me = await requireParent();
  const childId = z.string().uuid().parse(s(f, 'childId'));
  const row = assignmentRow.parse({
    course: s(f, 'course'), title: s(f, 'title'), kind: s(f, 'kind') || 'assignment', period: '', due: s(f, 'due'), closes: '',
    points_possible: s(f, 'points'), score: '', submission_status: 'not_submitted', teacher: s(f, 'teacher'), source_url: s(f, 'url'),
    attempts_used: '', attempts_allowed: '', external_id: '',
  });
  await (await getDb()).asUser(me.userId, async (q) => {
    const [child] = await q<Row>(`select family_id from children where id = $1`, [childId]);
    if (!child) throw new Error('not allowed');
    const cid = await findOrCreateCourse(q, child.family_id, childId, row.course, row.teacher);
    const [p] = await q<Row>(`select id from grading_periods where child_id = $1 and kind = 'quarter' and coalesce($2::date, current_date) between starts_on and ends_on limit 1`, [childId, row.due]);
    await q(`insert into assignments(family_id, child_id, course_id, period_id, source, title, kind, teacher, source_url, due_at, points_possible, submission_status)
      values ($1,$2,$3,$4,'manual',$5,$6,$7,$8,$9,$10,'not_submitted')`,
      [child.family_id, childId, cid, p?.id ?? null, row.title, row.kind, row.teacher, row.source_url, row.due ? `${row.due}T23:59` : null, row.points_possible]);
  });
  redirect(`/child/${childId}/assignments?added=1`);
}

// ---------- integrations ----------
export async function connectCanvas(f: FormData) {
  const me = await requireParent();
  const childId = z.string().uuid().parse(s(f, 'childId'));
  const baseUrl = z.string().url().startsWith('https://').parse(s(f, 'baseUrl'));
  const token = z.string().min(20).max(400).parse(s(f, 'token'));
  const studentId = z.coerce.number().int().positive().parse(s(f, 'studentCanvasId'));
  const db = await getDb();
  const url = `${new URL(baseUrl).origin}#student=${studentId}`;
  // Reconnecting the same Canvas account replaces its token instead of creating a duplicate connection.
  const [existing] = await db.asUser(me.userId, (q) => q<Row>(`select id from integration_connections where child_id = $1 and provider = 'canvas' and base_url = $2 limit 1`, [childId, url]));
  const conn = existing ?? (await db.asUser(me.userId, (q) => q<Row>(`insert into integration_connections(family_id, child_id, provider, status, display_name, base_url)
      values ($1,$2,'canvas','not_configured',$3,$4) returning id`, [me.familyId, childId, `Canvas (${new URL(baseUrl).host})`, url])))[0];
  await db.asService(async (q) => {
    await q(`delete from integration_secrets where connection_id = $1`, [conn.id]);
    await q(`insert into integration_secrets(connection_id, family_id, ciphertext) values ($1,$2,$3)`, [conn.id, me.familyId, encryptSecret(token)]);
  });
  await runConnectionSync(conn.id, me.familyId);
  redirect('/settings/connections?connected=1');
}

export async function syncNow(f: FormData) {
  const me = await requireParent();
  const id = z.string().uuid().parse(s(f, 'connectionId'));
  const [c] = await (await getDb()).asUser(me.userId, (q) => q<Row>(`select id from integration_connections where id = $1`, [id])); // RLS check
  if (!c) throw new Error('not allowed');
  await runConnectionSync(id, me.familyId);
  revalidatePath('/', 'layout');
  redirect('/settings/connections?synced=1');
}

async function runConnectionSync(connectionId: string, familyId: string) {
  const db = await getDb();
  const [row] = await db.asService((q) => q<Row>(`select c.*, s.ciphertext, ch.display_name child_name from integration_connections c
      left join integration_secrets s on s.connection_id = c.id left join children ch on ch.id = c.child_id where c.id = $1 and c.family_id = $2`, [connectionId, familyId]));
  if (!row || row.provider !== 'canvas') return;
  const [base, frag] = String(row.base_url ?? '').split('#student=');
  if (!row.ciphertext || base.includes('example.test')) {
    // Demo connection: simulate an expired token so the honest-failure path is visible.
    await syncConnection(db, connectionId, { name: 'Canvas', describeScope: () => `Assignments, scores and course grades for ${row.child_name}`,
      checkAuth: async () => ({ ok: false, reason: 'Access token expired (simulated demo connection)' }), fetchAll: async () => null }, () => []);
    return;
  }
  const adapter = canvasAdapter({ baseUrl: base, token: decryptSecret(row.ciphertext), studentCanvasId: Number(frag), childName: row.child_name });
  await syncConnection(db, connectionId, adapter, normalizeCanvas, new Date(), canvasCourseScores);
}

export async function acceptInvite(f: FormData) {
  const uid = await currentUserId(); if (!uid) redirect('/login');
  await (await getDb()).asUser(uid, (q) => q(`select app.accept_invite($1, $2)`, [s(f, 'token'), s(f, 'displayName') || 'Family member']));
  redirect('/');
}

// ---------- browser extension ----------
export async function createPairingCode(f: FormData) {
  const me = await requireParent();
  const childId = z.string().uuid().parse(s(f, 'childId'));
  const provider = z.enum(['canvas', 'skyward']).parse(s(f, 'provider'));
  const { newPairingCode, sha256 } = await import('@/lib/integrations/ingest');
  const code = newPairingCode();
  await (await getDb()).asUser(me.userId, (q) => q(`insert into extension_pairing_codes(code_hash, family_id, child_id, provider, created_by, expires_at)
      values ($1,$2,$3,$4,$5, now() + interval '10 minutes')`, [sha256(code), me.familyId, childId, provider, me.userId]));
  redirect(`/settings/connections?pair=${code.slice(0, 4)}-${code.slice(4)}&provider=${provider}#extension`);
}

export async function revokeExtension(f: FormData) {
  const me = await requireParent();
  await (await getDb()).asUser(me.userId, (q) => q(`update extension_tokens set revoked_at = now() where id = $1 and revoked_at is null`, [z.string().uuid().parse(s(f, 'id'))]));
  redirect('/settings/connections#extension');
}
