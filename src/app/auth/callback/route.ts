import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/auth/supabase';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) await (await supabaseServer()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL('/', req.url));
}
