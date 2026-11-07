import type { Assignment, FamilyCalendar, Reply } from './types';
import { REPLY_LABELS } from './types';
import { classify, questionsToAsk, remindersDue, teacherFollowUps, type FollowUpRule, type Scope } from './assignments';
import { deferPastQuietHours, isSchoolDay, localDate, localTimeOn } from './calendar';
import { nudge } from './encouragement';

export type Kind = 'daily_summary' | 'assignment_question' | 'reminder' | 'followup_nudge' | 'reply_recap';
export type Channel = 'email' | 'in_app';

export interface Recipient {
  userId: string;
  role: 'parent' | 'guardian' | 'student';
  childId: string | null; // for students
  consents: Set<Channel>;
  prefs: {
    emailEnabled: boolean; inAppEnabled: boolean;
    dailySummary: boolean; summaryTime: string;
    assignmentQuestions: boolean; reminders: boolean; replyRecaps: boolean;
    recapMode: 'wait_all' | 'partial'; recapMaxWaitHours: number;
    followUp: FollowUpRule;
  };
}

export interface ChildSnapshot {
  childId: string; name: string;
  assignments: Assignment[]; replies: Reply[]; scope: Scope;
  questionsAskedAt: Map<string, Date>; // assignmentId -> when the question was sent
}

export interface FamilySnapshot {
  familyId: string; calendar: FamilyCalendar;
  staleDataMode: 'partial_labeled' | 'wait';
  staleConnections: { name: string; lastSuccessAt: Date | null; notRefreshed: string | null }[];
  recipients: Recipient[]; children: ChildSnapshot[];
  appUrl: string;
}

export interface Intent {
  familyId: string; recipientUserId: string; kind: Kind; channel: Channel;
  idempotencyKey: string; subject: string; body: string; scheduledFor: Date;
  payload: Record<string, unknown>;
}

function channelsFor(r: Recipient): Channel[] {
  const out: Channel[] = [];
  if (r.prefs.emailEnabled && r.consents.has('email')) out.push('email');   // explicit consent required
  if (r.prefs.inAppEnabled && r.consents.has('in_app')) out.push('in_app');
  return out;
}

const fmtDue = (a: Assignment, tz: string) =>
  a.dueAt ? a.dueAt.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }) : 'no due date';

export function staleBanner(s: FamilySnapshot): string | null {
  if (!s.staleConnections.length) return null;
  return s.staleConnections.map((c) =>
    `⚠ ${c.name} needs reconnecting. Showing data from ${c.lastSuccessAt ? c.lastSuccessAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never'}. ${c.notRefreshed ?? ''}`.trim()).join('\n');
}

/**
 * Plan every notification that SHOULD exist right now. Pure and deterministic.
 * Idempotency keys make re-planning (e.g. after each sync) safe: the queue insert ignores keys it has seen.
 */
export function planNotifications(s: FamilySnapshot, now: Date): Intent[] {
  const tz = s.calendar.timezone;
  const today = localDate(now, tz);
  const schoolDay = isSchoolDay(today, s.calendar);
  const out: Intent[] = [];
  const banner = staleBanner(s);
  const push = (r: Recipient, i: Omit<Intent, 'familyId' | 'recipientUserId' | 'channel' | 'idempotencyKey' | 'scheduledFor'> & { key: string; at?: Date }) => {
    for (const ch of channelsFor(r)) {
      out.push({
        familyId: s.familyId, recipientUserId: r.userId, kind: i.kind, channel: ch,
        idempotencyKey: `${i.key}:${ch}`, subject: i.subject, body: i.body, payload: i.payload,
        scheduledFor: deferPastQuietHours(i.at ?? now, s.calendar),
      });
    }
  };

  for (const r of s.recipients) {
    const kids = r.role === 'student' ? s.children.filter((c) => c.childId === r.childId) : s.children;
    for (const c of kids) {
      // Student: reminders on school days for still-doable work.
      if (r.role === 'student' && r.prefs.reminders && schoolDay) {
        for (const a of remindersDue(c.assignments, c.replies, c.scope, now)) {
          push(r, { kind: 'reminder', key: `reminder:${r.userId}:${a.id}:${today}`,
            subject: `Reminder: ${a.title}`, body: `${a.courseName ?? ''} — due ${fmtDue(a, tz)}. ${nudge(a.id + today)}`,
            payload: { assignmentId: a.id, childId: c.childId, replyLink: true } });
        }
      }
      // Student: one question per overdue/missing assignment with no reply.
      if (r.role === 'student' && r.prefs.assignmentQuestions) {
        for (const a of questionsToAsk(c.assignments, c.replies, c.scope, now)) {
          push(r, { kind: 'assignment_question', key: `question:${r.userId}:${a.id}`,
            subject: `Quick check: ${a.title}`, body: `What's the status of "${a.title}" (${a.courseName ?? ''})? One tap is enough.`,
            payload: { assignmentId: a.id, childId: c.childId, replyLink: true } });
        }
      }
      // Student: "done but no grade yet" -> ask them to check with the teacher (once per reply).
      if (r.role === 'student' && r.prefs.reminders) {
        for (const f of teacherFollowUps(c.assignments, c.replies, c.scope, r.prefs.followUp, s.calendar, now)) {
          if (f.reason !== 'done_but_ungraded') continue;
          const reply = c.replies.filter((x) => x.assignmentId === f.assignment.id).sort((a, b) => +b.createdAt - +a.createdAt)[0];
          push(r, { kind: 'followup_nudge', key: `followup:${r.userId}:${f.assignment.id}:${reply.id}`,
            subject: `Check in with your teacher: ${f.assignment.title}`,
            body: `You said this was done, but no grade shows yet. Could you ask ${f.assignment.teacher ?? 'your teacher'} if they received it?`,
            payload: { assignmentId: f.assignment.id, childId: c.childId } });
        }
      }
    }

    // Parent: daily summary at their chosen time.
    if (r.role !== 'student' && r.prefs.dailySummary) {
      const at = localTimeOn(today, r.prefs.summaryTime, tz);
      if (now >= at) {
        if (banner && s.staleDataMode === 'wait') {
          // Parent chose to wait for reconnection rather than get a partial summary.
        } else {
          const lines: string[] = [];
          for (const c of kids) {
            const counts: Record<string, number> = {};
            for (const a of c.assignments) {
              if (c.scope.excluded.has(a.id)) continue;
              const b = classify(a, now);
              counts[b] = (counts[b] ?? 0) + 1;
            }
            const fu = teacherFollowUps(c.assignments, c.replies, c.scope, r.prefs.followUp, s.calendar, now).length;
            lines.push(`${c.name}: ${counts.upcoming ?? 0} upcoming · ${counts.overdue ?? 0} overdue · ${counts.missing ?? 0} missing · ${counts.submitted_ungraded ?? 0} awaiting grade · ${fu} need teacher follow-up`);
          }
          push(r, { kind: 'daily_summary', key: `summary:${r.userId}:${today}`, at,
            subject: banner ? 'Daily summary (partial — some data not refreshed)' : 'Daily family summary',
            body: [banner, ...lines].filter(Boolean).join('\n'), payload: { partial: !!banner } });
        }
      }
    }

    // Parent: recap of today's student replies.
    if (r.role !== 'student' && r.prefs.replyRecaps) {
      for (const c of kids) {
        const asked = [...c.questionsAskedAt.entries()].filter(([, t]) => localDate(t, tz) === today);
        if (!asked.length) continue;
        const answered = asked.filter(([aid, t]) => c.replies.some((x) => x.assignmentId === aid && x.createdAt >= t));
        const firstAsked = asked.map(([, t]) => t).sort((a, b) => +a - +b)[0];
        const waitedLongEnough = now.getTime() - firstAsked.getTime() >= r.prefs.recapMaxWaitHours * 3600_000;
        const all = answered.length === asked.length;
        if (r.prefs.recapMode === 'wait_all' && !all && !waitedLongEnough) continue;
        if (r.prefs.recapMode === 'partial' && !answered.length) continue;
        const body = answered.map(([aid]) => {
          const a = c.assignments.find((x) => x.id === aid);
          const rep = c.replies.filter((x) => x.assignmentId === aid).sort((p, q) => +q.createdAt - +p.createdAt)[0];
          return `• ${a?.title ?? 'Assignment'}: ${REPLY_LABELS[rep.status]}${rep.note ? ` — "${rep.note}"` : ''}`;
        });
        if (!all) body.push(`(${asked.length - answered.length} not answered yet)`);
        // Keyed by answered count so a later, fuller recap can follow a partial one without duplicating it.
        push(r, { kind: 'reply_recap', key: `recap:${r.userId}:${c.childId}:${today}:${all ? 'all' : answered.length}`,
          subject: `${c.name}'s replies${all ? '' : ' (partial)'}`, body: body.join('\n'), payload: { childId: c.childId } });
      }
    }
  }
  return out;
}

/** Exponential backoff for retries: 1m, 5m, 25m, 2h, then give up. */
export const MAX_ATTEMPTS = 5;
export function nextRetryAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + Math.min(60_000 * 5 ** (attempts - 1), 2 * 3600_000));
}
