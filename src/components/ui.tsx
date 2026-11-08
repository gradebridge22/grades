import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({ title, action, children, className = '', stripe }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; stripe?: string }) {
  return (
    <section className={`notebook-card relative overflow-hidden p-4 sm:p-5 ${stripe ? 'pl-5 sm:pl-6' : ''} ${className}`}>
      {stripe && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: stripe }} />}
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>{action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  neutral: 'bg-[#f1f1ee] text-[#4a4f57]', good: 'bg-good-soft text-good', warn: 'bg-[#fdf0e6] text-warn',
  bad: 'bg-bad-soft text-bad', info: 'bg-[#e8eff9] text-link', muted: 'border border-line text-muted',
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function PageHeader({ title, sub, back, eyebrow }: { title: string; sub?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <header className="mb-5">
      {back && <Link href={back.href} className="mb-2 inline-block text-sm text-muted hover:text-ink">← {back.label}</Link>}
      {eyebrow && <div className="text-[13px] text-muted">{eyebrow}</div>}
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      {sub && <div className="mt-1 max-w-2xl text-sm text-muted">{sub}</div>}
    </header>
  );
}

const STAT_COLOR: Record<Tone, string> = { neutral: 'text-ink', good: 'text-good', warn: 'text-warn', bad: 'text-bad', info: 'text-link', muted: 'text-muted' };
void STAT_COLOR;
const STAT_TILE: Record<Tone, string> = {
  neutral: 'bg-[#f1f0ec] text-[#22221f]', good: 'bg-[#ddf5e4] text-[#1f6b3a]', warn: 'bg-[#ffe7d6] text-[#8a4315]',
  bad: 'bg-[#ffdcdc] text-[#9a2323]', info: 'bg-[#eaf2ff] text-[#1c4fa0]', muted: 'bg-[#f1f0ec] text-[#55554f]',
};
/** KPI cards. */
export function Tally({ items }: { items: { label: string; value: ReactNode; tone?: Tone; href?: string; sub?: string }[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
      {items.map((it) => {
        const body = (
          <div className={`flex h-full flex-col gap-1 rounded-[22px] px-[18px] py-4 ${STAT_TILE[it.tone ?? 'neutral']} ${it.href ? 'transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.35)]' : ''}`}>
            <span className="text-[34px] font-extrabold leading-none tracking-[-0.02em]">{it.value}</span>
            <span className="text-sm font-semibold">{it.label}{it.href ? <span aria-hidden> →</span> : null}</span>
            {it.sub && <span className="text-xs opacity-80">{it.sub}</span>}
          </div>
        );
        return it.href ? <Link key={it.label} href={it.href}>{body}</Link> : <div key={it.label}>{body}</div>;
      })}
    </div>
  );
}
export function Stat({ label, value, tone = 'neutral', href }: { label: string; value: ReactNode; tone?: Tone; href?: string }) {
  return <Tally items={[{ label, value, tone, href }]} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-[#f7f7f5] px-3 py-4 text-center text-sm text-muted">{children}</p>;
}

/** Encouragement / verified improvement callout. */
export function Praise({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-[10px] border border-[#cfe7e0] bg-brand-soft px-4 py-3 text-sm text-[#0b5f4e] ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 16l5-5 4 4 7-7M15 8h5v5" /></svg>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/** Stale data / reconnect notice. */
export function Stamp({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' }) {
  const c = tone === 'warn' ? 'border-[#f0d9c4] bg-warn-soft text-[#8a4315]' : 'border-[#cddbf1] bg-[#f3f7fd] text-link';
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-snug ${c}`}>
      <span aria-hidden className={`mt-1.5 h-2 w-2 flex-none rounded-full ${tone === 'warn' ? 'bg-[#d97706]' : 'bg-link'}`} /><div>{children}</div>
    </div>
  );
}

export function StatusLabel({ kind }: { kind: 'implemented' | 'mocked' | 'waiting' }) {
  const m = { implemented: ['good', 'Implemented'], mocked: ['info', 'Mocked'], waiting: ['warn', 'Waiting for integration'] } as const;
  return <Badge tone={m[kind][0]}>{m[kind][1]}</Badge>;
}

export function Sparkline({ points }: { points: number[]; color?: string }) {
  if (points.length < 2) return <span className="text-xs text-muted">—</span>;
  const min = Math.min(...points) - 1, max = Math.max(...points) + 1, w = 64, h = 18;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / (max - min)) * h}`).join(' ');
  const up = points.at(-1)! >= points[0];
  return <svg width={w} height={h} className="inline-block align-middle" aria-hidden><polyline points={d} fill="none" strokeWidth="1.8" stroke={up ? '#0e7c66' : '#b4541a'} /></svg>;
}
