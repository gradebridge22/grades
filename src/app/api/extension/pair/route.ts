import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/data/db';
import { redeemPairingCode } from '@/lib/integrations/ingest';
import { cors, preflight } from '../cors';

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const h = cors(req.headers.get('origin'));
  const body = await req.json().catch(() => null) as { code?: string; label?: string } | null;
  if (!body?.code) return NextResponse.json({ error: 'Missing code' }, { status: 400, headers: h });
  const r = await redeemPairingCode(await getDb(), body.code, body.label ?? 'Browser extension');
  if (!r) return NextResponse.json({ error: 'That code is wrong, expired, or already used. Make a new one in OnTrack Grades.' }, { status: 400, headers: h });
  return NextResponse.json(r, { headers: h });
}
