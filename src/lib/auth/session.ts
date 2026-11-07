import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '../data/db';
import { getMe, type Me } from '../data/queries';

export const DEMO_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const COOKIE = 'gb_demo_session';

export const DEMO_USERS = [
  { id: '00000000-0000-4000-8000-00000000a001', label: 'Demo Parent Alex', note: 'Maple family · 2 children' },
  { id: '00000000-0000-4000-8000-00000000a002', label: 'Demo Guardian Sam', note: 'Maple family · invited guardian' },
  { id: '00000000-0000-4000-8000-00000000a003', label: 'Ava (synthetic student)', note: 'Maple family · student view' },
  { id: '00000000-0000-4000-8000-00000000b001', label: 'Demo Parent Blake', note: 'Oak family · separate tenant' },
];

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production' && !DEMO_MODE) throw new Error('SESSION_SECRET required');
  return 'dev-only-session-secret-change-me-000000';
}
const sign = (v: string) => createHmac('sha256', sessionSecret()).update(v).digest('base64url');

export async function setDemoSession(userId: string) {
  if (!DEMO_MODE) throw new Error('demo login disabled');
  if (!DEMO_USERS.some((u) => u.id === userId)) throw new Error('unknown demo user');
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 });
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
  if (!DEMO_MODE) { const { supabaseServer } = await import('./supabase'); await (await supabaseServer()).auth.signOut(); }
}

/** Returns the verified user id, or null. Server-side only; never trusts client-provided ids. */
export async function currentUserId(): Promise<string | null> {
  if (DEMO_MODE) {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw) return null;
    const [id, sig] = raw.split('.');
    const exp = Buffer.from(sign(id)); const got = Buffer.from(sig ?? '');
    return exp.length === got.length && timingSafeEqual(exp, got) ? id : null;
  }
  const { supabaseServer } = await import('./supabase');
  const { data } = await (await supabaseServer()).auth.getUser(); // validates the JWT with Supabase Auth
  return data.user?.id ?? null;
}

export async function requireMe(): Promise<Me> {
  const uid = await currentUserId();
  if (!uid) redirect('/login');
  const me = await getMe(await getDb(), uid);
  if (!me) redirect('/onboarding');
  return me;
}
export async function requireParent(): Promise<Me> {
  const me = await requireMe();
  if (me.role === 'student') redirect('/student');
  return me;
}
