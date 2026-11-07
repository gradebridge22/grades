/** One small stroke-icon set used everywhere (no emoji, no stock icon pack). */
const PATHS: Record<string, string> = {
  check: 'M4 12l5 5L20 6',
  paper: 'M6 3h9l4 4v14H6zM9 12h7M9 16h5',
  school: 'M3 10l9-6 9 6M5 10v10h14V10M10 20v-5h4v5',
  clock: 'M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l3 2M9 2h6',
  key: 'M14 10a4 4 0 10-4 4l-6 6v-3h3v-3h3M15 7h.01',
  pencil: 'M12 20h9M16.5 3.5l4 4L8 20H4v-4z',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  up: 'M4 16l5-5 4 4 7-7M15 8h5v5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
};
export function Icon({ name, size = 18, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name] ?? PATHS.dots} />
    </svg>
  );
}
