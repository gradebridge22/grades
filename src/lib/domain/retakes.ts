import type { Assignment } from './types';
import { scorePct } from './assignments';

export type RetakeView =
  | 'confirmed_open'          // the source or teacher confirmed a retake window is open now
  | 'teacher_approved'        // teacher personally approved a retake
  | 'unused_attempts_unknown' // attempts remain on paper, but nobody has confirmed availability
  | 'attempts_unknown'        // the testing system doesn't expose attempts at all
  | 'closed'                  // retake window ended or no attempts remain
  | 'not_applicable';

export const RETAKE_LABELS: Record<RetakeView, string> = {
  confirmed_open: 'Retake open (confirmed)',
  teacher_approved: 'Teacher-approved retake',
  unused_attempts_unknown: 'Attempts may remain — ask the teacher',
  attempts_unknown: 'Attempts unknown',
  closed: 'Retake closed',
  not_applicable: '—',
};

export function attemptsText(a: Assignment): string {
  const used = a.attemptsUsed == null ? '?' : String(a.attemptsUsed);
  const allowed = a.attemptsUnlimited ? 'unlimited' : a.attemptsAllowed == null ? '?' : String(a.attemptsAllowed);
  return `${used} of ${allowed}`;
}

export function isImprovable(a: Assignment, threshold = 0.85): boolean {
  const pct = scorePct(a);
  return pct != null && pct < threshold;
}

/**
 * Classify retake availability WITHOUT guessing.
 * An unused attempt is never treated as an open retake: only an explicit confirmation or teacher approval is.
 */
export function retakeView(a: Assignment, now: Date): RetakeView {
  if (a.kind === 'assignment' && a.retakeStatus === 'none') return 'not_applicable';
  const windowEnded = a.retakeClosesAt != null && a.retakeClosesAt.getTime() <= now.getTime();
  if (a.retakeStatus === 'closed' || windowEnded) return 'closed';
  if (a.retakeStatus === 'teacher_approved') return 'teacher_approved';
  if (a.retakeStatus === 'confirmed_open') return 'confirmed_open';
  const noAttemptsLeft = !a.attemptsUnlimited && a.attemptsAllowed != null && a.attemptsUsed != null && a.attemptsUsed >= a.attemptsAllowed;
  if (noAttemptsLeft) return 'closed';
  if (a.attemptsUsed == null || (a.attemptsAllowed == null && !a.attemptsUnlimited)) return 'attempts_unknown';
  return 'unused_attempts_unknown';
}

export function isAdvertisedAsAvailable(v: RetakeView): boolean {
  return v === 'confirmed_open' || v === 'teacher_approved';
}

export function retakeAdvice(v: RetakeView): string | null {
  switch (v) {
    case 'attempts_unknown': return 'This testing system does not show attempts. Ask the teacher whether a retake is possible.';
    case 'unused_attempts_unknown': return 'Attempts remain, but the quiz may be closed. Ask the teacher before planning a retake.';
    case 'confirmed_open': return 'A retake is open. Plan a time to prepare and retake it before it closes.';
    case 'teacher_approved': return 'The teacher approved a retake. Confirm the date and time with them.';
    default: return null;
  }
}

export interface RetakeOpportunity { assignment: Assignment; view: RetakeView; advice: string | null }

/** Check every course for low or improvable scores and report retake status honestly. */
export function retakeOpportunities(assignments: Assignment[], now: Date, excluded: Set<string> = new Set()): RetakeOpportunity[] {
  return assignments
    .filter((a) => !excluded.has(a.id) && isImprovable(a) && (a.kind !== 'assignment' || a.retakeStatus !== 'none'))
    .map((a) => { const view = retakeView(a, now); return { assignment: a, view, advice: retakeAdvice(view) }; })
    .sort((x, y) => Number(isAdvertisedAsAvailable(y.view)) - Number(isAdvertisedAsAvailable(x.view)));
}
