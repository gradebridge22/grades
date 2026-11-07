'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Kid = { id: string; name: string };

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || (href !== '/parent' && href !== '/student' && path.startsWith(href + '/'));
}

/** Desktop sidebar: children first, then family tools. */
export function Sidebar({ role, kids }: { role: 'parent' | 'guardian' | 'student'; kids: Kid[] }) {
  const active = useActive();
  const item = (href: string, label: string) => (
    <Link key={href} href={href} className={`flex min-h-9 items-center rounded-md px-2.5 text-sm ${active(href) ? 'bg-[#e9e9e5] font-semibold text-ink' : 'text-[#4a4f57] hover:bg-[#ececE8]'}`}>{label}</Link>
  );
  const section = (label: string) => <span className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>;
  if (role === 'student') return <nav aria-label="Main" className="flex flex-col gap-0.5">{item('/student', 'My work')}{item('/settings/notifications', 'Notifications')}</nav>;
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {item('/parent', 'Overview')}
      {section('Children')}
      {kids.map((k) => item(`/child/${k.id}`, k.name))}
      {section('Family')}
      {item('/follow-up', 'Teacher follow-up')}{item('/explore', 'Explore')}{item('/settings/notifications', 'Notifications')}
      {item('/settings/connections', 'Connections')}{item('/settings/privacy', 'Privacy')}
    </nav>
  );
}

/** Phone bottom bar. */
export function BottomNav({ role }: { role: 'parent' | 'guardian' | 'student' }) {
  const active = useActive();
  const items: [string, string][] = role === 'student'
    ? [['/student', 'My work'], ['/settings/notifications', 'Alerts']]
    : [['/parent', 'Overview'], ['/follow-up', 'Follow-up'], ['/settings/connections', 'Connect'], ['/settings/notifications', 'Alerts']];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-white/95 backdrop-blur lg:hidden">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={`flex min-h-14 flex-1 items-center justify-center text-[13px] ${active(href) ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</Link>
      ))}
    </nav>
  );
}
