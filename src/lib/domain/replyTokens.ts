import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { REPLY_STATUSES, type ReplyStatus } from './types';

/**
 * One-tap reply links.
 * The token is HMAC-signed and expiring, and carries a nonce that must exist (unrevoked) in reply_links.
 * Opening the link (GET/HEAD — what email scanners and link previews do) NEVER records anything.
 * Only an explicit POST with confirm=yes records a reply.
 */
export interface ReplyTokenPayload { aid: string; cid: string; fid: string; uid: string; exp: number; n: string }

const b64 = (b: Buffer) => b.toString('base64url');

function secret(): string {
  const s = process.env.REPLY_LINK_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('REPLY_LINK_SECRET must be set (32+ chars)');
  return 'dev-only-reply-link-secret-change-me-0000';
}

export function signReplyToken(p: Omit<ReplyTokenPayload, 'n' | 'exp'> & { ttlHours?: number; now?: Date; nonce?: string }) {
  const now = p.now ?? new Date();
  const payload: ReplyTokenPayload = {
    aid: p.aid, cid: p.cid, fid: p.fid, uid: p.uid,
    exp: Math.floor(now.getTime() / 1000) + (p.ttlHours ?? 72) * 3600,
    n: p.nonce ?? b64(randomBytes(16)),
  };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac('sha256', secret()).update(body).digest());
  return { token: `${body}.${sig}`, payload };
}

export type VerifyResult = { ok: true; payload: ReplyTokenPayload } | { ok: false; error: 'malformed' | 'bad_signature' | 'expired' };

export function verifyReplyToken(token: string, now = new Date()): VerifyResult {
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, error: 'malformed' };
  const expected = createHmac('sha256', secret()).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: 'bad_signature' };
  let payload: ReplyTokenPayload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, error: 'malformed' }; }
  if (payload.exp * 1000 <= now.getTime()) return { ok: false, error: 'expired' };
  return { ok: true, payload };
}

export interface ReplyLinkStore {
  isNonceActive(nonce: string, now: Date): Promise<boolean>;
  recordReply(p: ReplyTokenPayload, status: ReplyStatus, note: string | null): Promise<void>;
}

export type ReplyLinkOutcome =
  | { kind: 'render_confirm'; payload: ReplyTokenPayload; preselected: ReplyStatus | null }
  | { kind: 'recorded'; status: ReplyStatus }
  | { kind: 'error'; status: number; message: string };

/**
 * The only code path for one-tap replies. Pure apart from the injected store, so it is unit-tested.
 * GET/HEAD/anything-not-POST: render a confirmation page; no side effects.
 * POST: requires confirm=yes and a valid status.
 */
export async function handleReplyLink(
  req: { method: string; token: string; query?: Record<string, string | undefined>; form?: Record<string, string | undefined> },
  store: ReplyLinkStore, now = new Date(),
): Promise<ReplyLinkOutcome> {
  const v = verifyReplyToken(req.token, now);
  if (!v.ok) return { kind: 'error', status: v.error === 'expired' ? 410 : 400, message: v.error === 'expired' ? 'This link has expired. Open the app to reply.' : 'This link is not valid.' };
  if (!(await store.isNonceActive(v.payload.n, now))) return { kind: 'error', status: 410, message: 'This link was revoked. Open the app to reply.' };

  if (req.method.toUpperCase() !== 'POST') {
    const pre = req.query?.s;
    return { kind: 'render_confirm', payload: v.payload, preselected: isReplyStatus(pre) ? pre : null };
  }
  const f = req.form ?? {};
  if (f.confirm !== 'yes') return { kind: 'error', status: 400, message: 'Please tap a button to confirm.' };
  if (!isReplyStatus(f.status)) return { kind: 'error', status: 400, message: 'Pick one of the reply options.' };
  const note = (f.note ?? '').trim().slice(0, 1000) || null;
  await store.recordReply(v.payload, f.status, note);
  return { kind: 'recorded', status: f.status };
}

export function isReplyStatus(s: unknown): s is ReplyStatus {
  return typeof s === 'string' && (REPLY_STATUSES as readonly string[]).includes(s);
}
