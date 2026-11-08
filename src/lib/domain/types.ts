export type Source = 'manual' | 'csv' | 'canvas' | 'skyward';
export type SubmissionStatus = 'not_submitted' | 'submitted' | 'graded' | 'missing' | 'excused' | 'unknown';
export type RetakeStatus = 'none' | 'confirmed_open' | 'teacher_approved' | 'closed' | 'unknown';

export const REPLY_STATUSES = [
  'already_did', 'did_on_paper', 'did_at_school', 'need_at_school',
  'needs_code', 'working_on_it', 'need_help', 'other',
] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export const REPLY_LABELS: Record<ReplyStatus, string> = {
  already_did: 'Already did it',
  did_on_paper: 'Did it on paper',
  did_at_school: 'Did it at school',
  need_at_school: 'Need to do it at school',
  needs_code: 'Needs a code',
  working_on_it: 'Working on it',
  need_help: 'Need help',
  other: 'Other reason',
};

/** Replies that claim the work is finished (and therefore start the teacher-follow-up clock). */
export const DONE_REPLIES: ReadonlySet<ReplyStatus> = new Set(['already_did', 'did_on_paper', 'did_at_school']);

export interface Assignment {
  id: string;
  familyId: string;
  childId: string;
  courseId: string;
  courseName?: string;
  periodId: string | null;
  source: Source;
  title: string;
  kind: 'assignment' | 'quiz' | 'test';
  teacher: string | null;
  sourceUrl: string | null;
  dueAt: Date | null;
  closesAt: Date | null;
  pointsPossible: number | null;
  score: number | null;
  submissionStatus: SubmissionStatus;
  submittedAt: Date | null;
  gradedAt: Date | null;
  /** A planner / to-do checkbox. NEVER evidence of submission. */
  plannerChecked: boolean;
  attemptsUsed: number | null;
  attemptsAllowed: number | null;
  attemptsUnlimited: boolean;
  retakeStatus: RetakeStatus;
  retakeClosesAt: Date | null;
  retakeNote: string | null;
  retakeVerifiedAt: Date | null;
  /** Gradebook category ("Tests") and its weight in percent, when known. */
  groupName?: string | null;
  groupWeight?: number | null;
}

export interface Reply {
  id: string;
  assignmentId: string;
  status: ReplyStatus;
  note: string | null;
  channel: 'app' | 'email_link';
  createdAt: Date;
}

export interface GradingPeriod {
  id: string;
  name: string;
  kind: 'quarter' | 'semester' | 'year';
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
}

export interface FamilyCalendar {
  timezone: string;
  schoolDays: number[]; // ISO weekday 1..7
  holidays: string[]; // YYYY-MM-DD
  quietStart: string; // HH:MM
  quietEnd: string;
}
