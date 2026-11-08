import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Sidebar, BottomNav } from '@/components/Nav';
import { DEMO_MODE, currentUserId } from '@/lib/auth/session';
import { getDb } from '@/lib/data/db';
import { getMe, listChildren } from '@/lib/data/queries';
import { logout } from './actions';
import { getViewPrefs } from '@/lib/viewPrefs.server';

export const metadata: Metadata = { title: 'OnTrack Grades', description: 'Schoolwork tracking for families', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#fffdf8' };
export const dynamic = 'force-dynamic';

function Logo() {
  return <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold"><span aria-hidden className="h-[22px] w-[22px] rounded-md bg-brand" />OnTrack Grades</Link>;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const uid = await currentUserId();
  const db = await getDb();
  const me = uid ? await getMe(db, uid) : null;
  const kids = me && me.role !== 'student' ? (await listChildren(db, me.userId)).map((k) => ({ id: k.id, name: k.display_name })) : [];
  const view = await getViewPrefs();
  return (
    <html lang="en" data-accent={view.accent} data-font={view.font} data-density={view.density}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {DEMO_MODE && (
          <div className="border-b border-line bg-white px-4 py-1.5 text-center text-xs text-muted">
            Demo mode · every person, school and grade here is <strong className="font-medium text-ink">synthetic</strong> · data resets when the server restarts
          </div>
        )}
        <div className="flex min-h-[calc(100vh-29px)]">
          {me && (
            <aside className="hidden w-60 flex-none flex-col border-r border-line bg-panel px-3.5 py-5 lg:flex">
              <div className="px-2.5 pb-4"><Logo /></div>
              <Sidebar role={me.role} kids={kids} />
              <div className="mt-auto border-t border-line px-2.5 pt-3 text-xs text-muted">
                <div className="truncate font-medium text-ink">{me.displayName}</div>
                <div className="truncate">{me.familyName}</div>
                <form action={logout}><button className="mt-2 text-muted hover:text-ink">Sign out</button></form>
              </div>
            </aside>
          )}
          <div className="min-w-0 flex-1">
            <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
              <Logo />
              {me && <form action={logout}><button className="text-xs text-muted">Sign out</button></form>}
            </header>
            <main className={`mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-8 lg:pb-12 ${me ? '' : 'pt-10'}`}>{children}</main>
          </div>
        </div>
        {me && <BottomNav role={me.role} />}
      </body>
    </html>
  );
}
