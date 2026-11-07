import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getMe } from '@/lib/data/queries';

export default async function Home() {
  const uid = await currentUserId();
  if (!uid) redirect('/login');
  const me = await getMe(await getDb(), uid);
  if (!me || (!me.onboarded && me.role !== 'student')) redirect('/onboarding');
  redirect(me.role === 'student' ? '/student' : '/parent');
}
