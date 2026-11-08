/** Per-browser display preferences ("Customize view"). Purely cosmetic: never affects what data is shown to whom. */
export const SECTIONS = {
  pastDue: 'Past due — can still be turned in',
  dueWeek: 'Due this week',
  closed: 'Missing — window closed',
  lowScores: 'Low scores',
  saidDone: 'Says it’s done — not graded yet',
  cheer: 'Send a cheer',
} as const;
export type SectionId = keyof typeof SECTIONS;

export const ACCENTS = { orange: '#E8590C', blue: '#1C4FA0', green: '#1F6B3A', purple: '#6741D9', ink: '#22221F' } as const;
export type Accent = keyof typeof ACCENTS;

export interface ViewPrefs {
  accent: Accent;
  font: 'friendly' | 'classic';
  density: 'comfy' | 'compact';
  courses: 'tiles' | 'table';
  coursePage: 'gradebook' | 'report';
  order: SectionId[];      // visible sections, in display order
}

export const DEFAULT_VIEW: ViewPrefs = {
  accent: 'orange', font: 'friendly', density: 'comfy', courses: 'tiles', coursePage: 'gradebook',
  order: ['pastDue', 'dueWeek', 'closed', 'lowScores', 'saidDone', 'cheer'],
};

export const VIEW_COOKIE = 'ot_view';

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

export function parseView(raw: string | undefined | null): ViewPrefs {
  let o: Record<string, unknown> = {};
  try { o = raw ? JSON.parse(raw) : {}; } catch { o = {}; }
  const ids = Object.keys(SECTIONS) as SectionId[];
  const order = Array.isArray(o.order) ? [...new Set((o.order as unknown[]).filter((x): x is SectionId => ids.includes(x as SectionId)))] : DEFAULT_VIEW.order;
  return {
    accent: pick(o.accent, Object.keys(ACCENTS) as Accent[], DEFAULT_VIEW.accent),
    font: pick(o.font, ['friendly', 'classic'] as const, DEFAULT_VIEW.font),
    density: pick(o.density, ['comfy', 'compact'] as const, DEFAULT_VIEW.density),
    courses: pick(o.courses, ['tiles', 'table'] as const, DEFAULT_VIEW.courses),
    coursePage: pick(o.coursePage, ['gradebook', 'report'] as const, DEFAULT_VIEW.coursePage),
    order,
  };
}

/** US-style letter from a percent (display aid only; schools may use their own scale). */
export function letterFor(p: number | null): string | null {
  if (p == null) return null;
  const base = p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';
  if (base === 'F') return 'F';
  const r = p % 10;
  return base + (p >= 97 || (base !== 'A' && r >= 7) ? '+' : r < 3 && p < 100 ? '−' : '');
}
