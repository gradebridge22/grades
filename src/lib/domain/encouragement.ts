/** Short, varied, never-shaming messages. Praise is only for VERIFIED improvements (a source-confirmed score/grade change). */
const NUDGES = [
  'Small steps add up. One thing at a time.',
  'You have got this — pick the quickest one first.',
  'Future you will be glad you did this today.',
  'Ten focused minutes is a great start.',
  'Asking for help is a smart move, not a weak one.',
  'Progress beats perfect.',
];
const PRAISE = [
  (c: string, d: number) => `Nice work — ${c} is up ${d.toFixed(1)} points.`,
  (c: string, d: number) => `Your effort in ${c} is paying off: +${d.toFixed(1)}.`,
  (c: string, d: number) => `${c} improved by ${d.toFixed(1)} points. Keep it going!`,
];

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

export function nudge(seed: string) { return pick(NUDGES, seed); }

export interface VerifiedImprovement { course: string; from: number; to: number }
export function praise(i: VerifiedImprovement, seed: string): string | null {
  const d = i.to - i.from;
  if (!(d >= 0.5)) return null; // no praise for flat or invented changes
  return pick(PRAISE, seed)(i.course, d);
}

/** Improvements from grade history: only consecutive observed values; never interpolates missing data. */
export function improvementsFromHistory(series: { course: string; points: { percent: number | null; at: Date }[] }[]): VerifiedImprovement[] {
  const out: VerifiedImprovement[] = [];
  for (const s of series) {
    const pts = s.points.filter((p) => p.percent != null).sort((a, b) => +a.at - +b.at);
    if (pts.length < 2) continue;
    const from = pts[pts.length - 2].percent!, to = pts[pts.length - 1].percent!;
    if (to > from) out.push({ course: s.course, from, to });
  }
  return out;
}
