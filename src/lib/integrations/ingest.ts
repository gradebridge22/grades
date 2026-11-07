/**
 * Ingest from the OnTrack Grades browser extension.
 * Auth: a bearer token minted by pairing (sha256 stored server-side, scoped to ONE child + connection).
 * The payload is validated strictly; everything is upserted by (child, source, external_id), so repeated
 * syncs never duplicate rows, and parent dismissals / student replies (separate tables) are untouched.
 */
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db, Q } from '../data/engine';
import { applyNormalized, type NormalizedAssignment, type NormalizedGrade } from './syncService';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export function newPairingCode(): string {
  const b = randomBytes(8);
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

const isoOrNull = z.string().datetime({ offset: true }).nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const num = z.number().finite().nullable();
const short = (n: number) => z.string().trim().min(1).max(n);

export const ingestPayload = z.object({
  provider: z.enum(['canvas', 'skyward']),
  extensionVersion: short(20),
  capturedAt: z.string().datetime({ offset: true }),
  courses: z.array(z.object({ externalId: short(80), name: short(160), teacher: z.string().max(120).nullable() })).max(40),
  assignments: z.array(z.object({
    courseExternalId: short(80), externalId: short(120), title: short(300),
    kind: z.enum(['assignment', 'quiz', 'test']),
    sourceUrl: z.string().url().startsWith('https://').max(500).nullable(),
    dueAt: isoOrNull, closesAt: isoOrNull, pointsPossible: num, score: num,
    submissionStatus: z.enum(['not_submitted', 'submitted', 'graded', 'missing', 'excused', 'unknown']),
    submittedAt: isoOrNull, gradedAt: isoOrNull,
    attemptsUsed: z.number().int().min(0).nullable(), attemptsAllowed: z.number().int().min(1).nullable(), attemptsUnlimited: z.boolean(),
  })).max(3000),
  grades: z.array(z.object({
    courseExternalId: short(80), periodLabel: short(40),
    kind: z.enum(['quarter', 'semester', 'report_card']), status: z.enum(['provisional', 'final']),
    percent: z.number().min(0).max(200).nullable(), letter: z.string().max(8).nullable(),
  })).max(400),
});
export type IngestPayload = z.infer<typeof ingestPayload>;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Exchange a one-time code for a long-lived token. Returns the raw token ONCE. */
export async function redeemPairingCode(db: Db, code: string, label: string, now = new Date()) {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 8) return null;
  return db.asService(async (q) => {
    const [c] = await q<Row>(`update extension_pairing_codes set used_at = $2 where code_hash = $1 and used_at is null and expires_at > $2 returning *`,
      [sha256(clean), now.toISOString()]);
    if (!c) return null;
    const [child] = await q<Row>(`select display_name from children where id = $1`, [c.child_id]);
    let [conn] = await q<Row>(`select id from integration_connections where child_id = $1 and provider = $2 and base_url = 'extension'`, [c.child_id, c.provider]);
    if (!conn) {
      [conn] = await q<Row>(`insert into integration_connections(family_id, child_id, provider, status, display_name, base_url)
        values ($1,$2,$3,'connected',$4,'extension') returning id`,
        [c.family_id, c.child_id, c.provider, `${c.provider === 'canvas' ? 'Canvas' : 'Skyward'} (browser extension)`]);
    }
    const token = randomBytes(32).toString('base64url');
    await q(`insert into extension_tokens(token_hash, family_id, child_id, connection_id, created_by, label) values ($1,$2,$3,$4,$5,$6)`,
      [sha256(token), c.family_id, c.child_id, conn.id, c.created_by, label.slice(0, 60) || 'Browser extension']);
    return { token, provider: c.provider as 'canvas' | 'skyward', childName: child?.display_name as string };
  });
}

export async function resolveToken(q: Q, token: string) {
  if (!token || token.length < 20) return null;
  const [t] = await q<Row>(`select t.*, c.provider from extension_tokens t join integration_connections c on c.id = t.connection_id
      where t.token_hash = $1 and t.revoked_at is null`, [sha256(token)]);
  return t ?? null;
}

export type IngestResult = { ok: true; assignments: number; grades: number; warnings: string[] } | { ok: false; status: number; error: string };

export async function ingest(db: Db, token: string, body: unknown, now = new Date()): Promise<IngestResult> {
  const parsed = ingestPayload.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const p = parsed.data;
  return db.asService(async (q) => {
    const t = await resolveToken(q, token);
    if (!t) return { ok: false, status: 401, error: 'Extension not paired or access revoked' } as const;
    if (t.provider !== p.provider) return { ok: false, status: 403, error: `This pairing is for ${t.provider}, not ${p.provider}` } as const;
    const [conn] = await q<Row>(`select * from integration_connections where id = $1`, [t.connection_id]);
    const courseById = new Map(p.courses.map((c) => [c.externalId, c]));
    const warnings: string[] = [];
    const assignments: NormalizedAssignment[] = [];
    for (const a of p.assignments) {
      const c = courseById.get(a.courseExternalId);
      if (!c) { warnings.push(`assignment ${a.externalId}: unknown course`); continue; }
      assignments.push({ ...a, courseName: c.name, teacher: c.teacher });
    }
    const grades: NormalizedGrade[] = [];
    for (const g of p.grades) {
      const c = courseById.get(g.courseExternalId);
      if (!c) { warnings.push(`grade for ${g.courseExternalId}: unknown course`); continue; }
      grades.push({ ...g, courseName: c.name, teacher: c.teacher, sourceType: p.provider === 'skyward' ? 'official' : 'platform' });
    }
    // Courses with no assignments still get created, so "every course" shows up in the grades table.
    const counts = await applyNormalized(q, conn, assignments, grades, now, p.courses);
    warnings.push(...counts.warnings);
    await q(`update integration_connections set status = 'connected', last_attempt_at = $2, last_success_at = $2, last_error = null, not_refreshed = null where id = $1`, [conn.id, now.toISOString()]);
    await q(`update extension_tokens set last_used_at = $2 where id = $1`, [t.id, now.toISOString()]);
    await q(`insert into sync_runs(family_id, connection_id, started_at, finished_at, outcome, items_upserted, message) values ($1,$2,$3,$3,'success',$4,$5)`,
      [conn.family_id, conn.id, now.toISOString(), counts.assignments + counts.grades, `extension ${p.extensionVersion}${warnings.length ? `; ${warnings.length} warnings` : ''}`]);
    return { ok: true, assignments: counts.assignments, grades: counts.grades, warnings: warnings.slice(0, 20) } as const;
  });
}
