import { z } from 'zod';

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const optNum = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().finite().nullable());
const optStr = z.preprocess((v) => (v === '' || v == null ? null : String(v).trim()), z.string().max(500).nullable());
const optDate = z.preprocess((v) => (v === '' || v == null ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?$/, 'use YYYY-MM-DD or YYYY-MM-DD HH:MM').nullable());

export const gradeRow = z.object({
  course: z.string().trim().min(1).max(120),
  teacher: optStr,
  period: z.string().trim().min(1).max(60),
  kind: z.enum(['quarter', 'semester', 'report_card']),
  status: z.enum(['provisional', 'final']),
  percent: optNum,
  letter: optStr,
  source_type: z.enum(['official', 'platform']).default('official'),
});

export const assignmentRow = z.object({
  course: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  kind: z.enum(['assignment', 'quiz', 'test']).default('assignment'),
  period: optStr,
  due: optDate,
  closes: optDate,
  points_possible: optNum,
  score: optNum,
  submission_status: z.enum(['not_submitted', 'submitted', 'graded', 'missing', 'excused', 'unknown']).default('unknown'),
  teacher: optStr,
  source_url: z.preprocess((v) => (v === '' || v == null ? null : v), z.string().url().startsWith('https://').nullable()),
  attempts_used: optNum,
  attempts_allowed: z.preprocess((v) => (v === '' || v == null ? null : v), z.union([z.literal('unlimited'), z.coerce.number().int().min(1)]).nullable()),
  external_id: optStr,
});

export type GradeRow = z.infer<typeof gradeRow>;
export type AssignmentRow = z.infer<typeof assignmentRow>;

export interface ParseResult<T> { rows: T[]; errors: { line: number; message: string }[] }

export function parseTyped<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], errors: [{ line: 1, message: 'File is empty' }] };
  const cols = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: T[] = [], errors: ParseResult<T>['errors'] = [];
  body.forEach((cells, i) => {
    const obj: Record<string, string> = {};
    cols.forEach((c, j) => { obj[c] = (cells[j] ?? '').trim(); });
    const r = schema.safeParse(obj);
    if (r.success) rows.push(r.data);
    else errors.push({ line: i + 2, message: r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
  });
  if (body.length > 5000) errors.push({ line: 0, message: 'Too many rows (max 5000)' });
  return { rows, errors };
}

export const GRADE_TEMPLATE = 'course,teacher,period,kind,status,percent,letter,source_type\nAlgebra I,Mx. Teacher,Quarter 2,quarter,provisional,78.5,C+,official\n';
export const ASSIGNMENT_TEMPLATE = 'course,title,kind,period,due,closes,points_possible,score,submission_status,teacher,source_url,attempts_used,attempts_allowed,external_id\nAlgebra I,Unit 5 practice,assignment,Quarter 2,2026-11-12,2026-11-19,20,,not_submitted,Mx. Teacher,,,,\n';
