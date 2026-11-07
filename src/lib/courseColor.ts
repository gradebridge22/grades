/** Binder-divider colors: each course keeps one stable color everywhere in the app. */
const PALETTE = ['#2D5DA8', '#3C7A4E', '#B5473A', '#B8862B', '#6B4C9A', '#C2185B', '#1F7A86', '#7A5C3E'];
export function courseColor(key: string): string {
  let h = 0;
  for (const ch of key.toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
