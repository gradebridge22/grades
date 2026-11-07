import { NextResponse } from 'next/server';

/** Only browser-extension origins may call these endpoints cross-origin. Auth is the bearer token, never cookies. */
export function cors(origin: string | null) {
  const allowed = origin && /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin) ? origin : null;
  const h: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store' };
  if (allowed) Object.assign(h, { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
  return h;
}
export const preflight = (req: Request) => new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) });
export const MAX_BODY = 2_000_000;
