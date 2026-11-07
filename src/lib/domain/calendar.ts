import { DateTime } from 'luxon';
import type { FamilyCalendar } from './types';

export function localDate(at: Date, tz: string): string {
  return DateTime.fromJSDate(at, { zone: tz }).toISODate()!;
}

export function isSchoolDay(isoDate: string, cal: FamilyCalendar): boolean {
  const d = DateTime.fromISO(isoDate, { zone: cal.timezone });
  return cal.schoolDays.includes(d.weekday) && !cal.holidays.includes(isoDate);
}

/** The next school day strictly after `at`, in the family's timezone (YYYY-MM-DD). */
export function nextSchoolDay(at: Date, cal: FamilyCalendar): string {
  let d = DateTime.fromJSDate(at, { zone: cal.timezone }).startOf('day');
  for (let i = 0; i < 60; i++) {
    d = d.plus({ days: 1 });
    if (isSchoolDay(d.toISODate()!, cal)) return d.toISODate()!;
  }
  throw new Error('no school day within 60 days — check calendar settings');
}

/**
 * Deadline after a delay.
 *  - hours: absolute elapsed time (DST- and timezone-safe because it is instant arithmetic).
 *  - school_days: the same local wall-clock time after N school days in the FAMILY's timezone.
 */
export function addDelay(at: Date, value: number, unit: 'hours' | 'school_days', cal: FamilyCalendar): Date {
  if (unit === 'hours') return new Date(at.getTime() + value * 3600_000);
  const start = DateTime.fromJSDate(at, { zone: cal.timezone });
  let d = start;
  let counted = 0;
  for (let i = 0; counted < value && i < 400; i++) {
    d = d.plus({ days: 1 });
    if (isSchoolDay(d.toISODate()!, cal)) counted++;
  }
  return d.set({ hour: start.hour, minute: start.minute, second: start.second }).toJSDate();
}

function minutes(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); }

export function inQuietHours(at: Date, cal: FamilyCalendar): boolean {
  const t = DateTime.fromJSDate(at, { zone: cal.timezone });
  const now = t.hour * 60 + t.minute;
  const s = minutes(cal.quietStart), e = minutes(cal.quietEnd);
  return s <= e ? now >= s && now < e : now >= s || now < e; // window may wrap midnight
}

/** If `at` falls in quiet hours, push to the end of quiet hours; otherwise return `at`. */
export function deferPastQuietHours(at: Date, cal: FamilyCalendar): Date {
  if (!inQuietHours(at, cal)) return at;
  const t = DateTime.fromJSDate(at, { zone: cal.timezone });
  const e = minutes(cal.quietEnd);
  let end = t.set({ hour: Math.floor(e / 60), minute: e % 60, second: 0, millisecond: 0 });
  if (end <= t) end = end.plus({ days: 1 });
  return end.toJSDate();
}

/** Today's date for a family, plus the given local time, as an instant. */
export function localTimeOn(isoDate: string, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.fromISO(isoDate, { zone: tz }).set({ hour: h, minute: m || 0 }).toJSDate();
}
