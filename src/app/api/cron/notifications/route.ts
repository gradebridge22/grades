import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/data/db';
import { planAndEnqueue, sendDue } from '@/lib/notifications/jobs';
import { defaultEmailProvider } from '@/lib/notifications/email';
import { DEMO_MODE } from '@/lib/auth/session';

/** Scheduled job (e.g. Vercel Cron every 15 min): plan -> enqueue (idempotent) -> send due -> retention. */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const ok = secret ? got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret)) : DEMO_MODE;
  if (!ok) return new NextResponse('Unauthorized', { status: 401 });
  const db = await getDb();
  const now = new Date();
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const planned = await planAndEnqueue(db, now, appUrl);
  const sent = await sendDue(db, defaultEmailProvider(), now, appUrl);
  await db.asService((q) => q('select app.apply_retention()'));
  return NextResponse.json({ ok: true, ...planned, ...sent, at: now.toISOString() });
}
export const GET = run; // Vercel Cron uses GET with the CRON_SECRET bearer
export const POST = run;
