'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { parseView, SECTIONS, VIEW_COOKIE, DEFAULT_VIEW, type SectionId } from '@/lib/viewPrefs';

export async function saveView(f: FormData) {
  const ids = Object.keys(SECTIONS) as SectionId[];
  // Visible sections, ordered by their "position" number (ties keep the default order).
  const order = ids.filter((id) => f.get(`show_${id}`) === 'on')
    .map((id, i) => ({ id, pos: Number(f.get(`pos_${id}`)) || 99, i }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i).map((x) => x.id);
  const prefs = parseView(JSON.stringify({
    accent: f.get('accent'), font: f.get('font'), density: f.get('density'), courses: f.get('courses'), coursePage: f.get('coursePage'), order,
  }));
  (await cookies()).set(VIEW_COOKIE, JSON.stringify(prefs), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  revalidatePath('/', 'layout');
  redirect(String(f.get('back') || '/settings/view') + '?saved=1');
}

export async function resetView() {
  (await cookies()).set(VIEW_COOKIE, JSON.stringify(DEFAULT_VIEW), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true });
  revalidatePath('/', 'layout');
  redirect('/settings/view?saved=1');
}
