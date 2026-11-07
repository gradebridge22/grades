import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/data/db';
import { dbReplyLinkStore } from '@/lib/data/replyLinkStore';
import { handleReplyLink } from '@/lib/domain/replyTokens';

// Only POST records a reply. Any GET to this URL just bounces to the side-effect-free landing page.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return NextResponse.redirect(new URL(`/r/${(await params).token}`, req.url), 303);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.nextUrl.host) return new NextResponse('Cross-site request blocked', { status: 403 });
  const fd = await req.formData();
  const form = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const out = await handleReplyLink({ method: 'POST', token, form }, dbReplyLinkStore(await getDb()));
  if (out.kind === 'recorded') return NextResponse.redirect(new URL(`/r/${token}?done=${out.status}`, req.url), 303);
  return new NextResponse(out.kind === 'error' ? out.message : 'Bad request', { status: out.kind === 'error' ? out.status : 400 });
}
