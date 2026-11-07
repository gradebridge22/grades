import type { Assignment, FamilyCalendar } from '../src/lib/domain/types';
export const IDS = {
  famA: '10000000-0000-4000-8000-00000000000a', famB: '10000000-0000-4000-8000-00000000000b',
  parentA: '00000000-0000-4000-8000-00000000a001', guardianA: '00000000-0000-4000-8000-00000000a002',
  ava: '00000000-0000-4000-8000-00000000a003', parentB: '00000000-0000-4000-8000-00000000b001', cory: '00000000-0000-4000-8000-00000000b003',
  childAva: '20000000-0000-4000-8000-0000000000a1', childBen: '20000000-0000-4000-8000-0000000000a2', childCory: '20000000-0000-4000-8000-0000000000b1',
  q1Project: '50000000-0000-4000-8000-000000000008', readingLog: '50000000-0000-4000-8000-000000000006', oakAssignment: '50000000-0000-4000-8000-000000000010',
  osmosis: '50000000-0000-4000-8000-000000000003', canvasConn: '70000000-0000-4000-8000-000000000001',
};
export const cal = (tz = 'America/New_York'): FamilyCalendar => ({ timezone: tz, schoolDays: [1, 2, 3, 4, 5], holidays: [], quietStart: '21:00', quietEnd: '07:00' });
export function mk(p: Partial<Assignment> = {}): Assignment {
  return {
    id: p.id ?? 'a1', familyId: 'f', childId: 'c', courseId: 'k', courseName: 'Course', periodId: 'p2', source: 'manual', title: 'Thing',
    kind: 'assignment', teacher: null, sourceUrl: null, dueAt: null, closesAt: null, pointsPossible: 10, score: null,
    submissionStatus: 'not_submitted', submittedAt: null, gradedAt: null, plannerChecked: false, attemptsUsed: null, attemptsAllowed: null,
    attemptsUnlimited: false, retakeStatus: 'none', retakeClosesAt: null, retakeNote: null, retakeVerifiedAt: null, ...p,
  };
}
