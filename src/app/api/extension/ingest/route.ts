import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/data/db';
import { ingest } from '@/lib/integrations/ingest';
import { cors, preflight, MAX_BODY } from '../cors';

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const h = cors(req.headers.get('origin'));
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: h });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: h });
  let body: unknown; try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: h }); }
  const r = await ingest(await getDb(), token, body);
  return r.ok ? NextResponse.json(r, { headers: h }) : NextResponse.json({ error: r.error }, { status: r.status, headers: h });
}
