'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';

/** Email + password sign-in (for accounts created in the Supabase dashboard). */
export async function signInWithPassword(f: FormData) {
  const email = z.string().email().parse(String(f.get('email') ?? '').trim());
  const password = z.string().min(6).parse(String(f.get('password') ?? ''));
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
  if (error) redirect('/signin?error=1');
  redirect('/');
}
