import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getMe } from '@/lib/data/queries';

export async function GET() {
  const uid = await currentUserId();
  if (!uid) return new NextResponse('Unauthorized', { status: 401 });
  const db = await getDb();
  const me = await getMe(db, uid);
  if (!me || me.role === 'student') return new NextResponse('Forbidden', { status: 403 });
  const [r] = await db.asUser(uid, (q) => q<{ e: unknown }>(`select app.export_family($1) e`, [me.familyId]));
  return new NextResponse(JSON.stringify(r.e, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="ontrack-grades-export-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' },
  });
}
