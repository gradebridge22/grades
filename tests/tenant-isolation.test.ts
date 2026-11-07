import { describe, test, expect, beforeAll } from 'vitest';
import { createPglite, type Db } from '../src/lib/data/engine';
import { getChildData, addReply, excludeAssignment } from '../src/lib/data/queries';
import { IDS } from './helpers';

let db: Db;
beforeAll(async () => { db = await createPglite(); });

describe('Two families cannot access each other\'s data (Postgres RLS)', () => {
  test('parent B sees only Oak family rows', async () => {
    const r = await db.asUser(IDS.parentB, async (q) => ({
      fams: await q<{ id: string }>('select id from families'),
      kids: await q<{ id: string }>('select id from children'),
      asg: await q<{ family_id: string }>('select family_id from assignments'),
      replies: await q('select * from student_replies'),
      grades: await q<{ family_id: string }>('select family_id from grade_records'),
      audit: await q<{ family_id: string }>('select family_id from audit_log'),
    }));
    expect(r.fams.map((x) => x.id)).toEqual([IDS.famB]);
    expect(r.kids.map((x) => x.id)).toEqual([IDS.childCory]);
    expect(r.asg.every((a) => a.family_id === IDS.famB)).toBe(true);
    expect(r.replies).toHaveLength(0);
    expect(r.grades.every((g) => g.family_id === IDS.famB)).toBe(true);
    expect(r.audit.every((g) => g.family_id === IDS.famB)).toBe(true);
  });

  test('parent B cannot load family A child data via the app data layer', async () => {
    expect(await getChildData(db, IDS.parentB, IDS.childAva, 'America/New_York')).toBeNull();
    expect(await getChildData(db, IDS.parentA, IDS.childCory, 'America/New_York')).toBeNull();
  });

  test('parent B cannot write replies, exclusions or updates into family A', async () => {
    await expect(addReply(db, IDS.parentB, IDS.readingLog, 'already_did', null)).rejects.toThrow();
    await expect(excludeAssignment(db, IDS.parentB, IDS.readingLog, 'not mine')).rejects.toThrow();
    // Forged direct insert with family A's ids is rejected by the RLS WITH CHECK clause
    await expect(db.asUser(IDS.parentB, (q) => q(`insert into student_replies(family_id, child_id, assignment_id, status, channel, author_user_id)
      values ($1,$2,$3,'already_did','app',$4)`, [IDS.famA, IDS.childAva, IDS.readingLog, IDS.parentB]))).rejects.toThrow(/row-level security/);
    const upd = await db.asUser(IDS.parentB, (q) => q(`update assignments set score = 100 where family_id = $1 returning id`, [IDS.famA]));
    expect(upd).toHaveLength(0);
  });

  test('a student sees only their own child record, not siblings', async () => {
    const kids = await db.asUser(IDS.ava, (q) => q<{ id: string }>('select id from children'));
    expect(kids.map((k) => k.id)).toEqual([IDS.childAva]);
    const sibling = await db.asUser(IDS.ava, (q) => q('select * from assignments where child_id = $1', [IDS.childBen]));
    expect(sibling).toHaveLength(0);
  });

  test('students cannot edit assignments or see integrations/audit; can reply for themselves', async () => {
    const upd = await db.asUser(IDS.ava, (q) => q(`update assignments set score = 100 where child_id = $1 returning id`, [IDS.childAva]));
    expect(upd).toHaveLength(0);
    expect(await db.asUser(IDS.ava, (q) => q('select * from integration_connections'))).toHaveLength(0);
    expect(await db.asUser(IDS.ava, (q) => q('select * from audit_log'))).toHaveLength(0);
    await addReply(db, IDS.ava, IDS.osmosis, 'working_on_it', 'halfway');
  });

  test('integration secrets are unreadable by any signed-in user', async () => {
    await expect(db.asUser(IDS.parentA, (q) => q('select * from integration_secrets'))).rejects.toThrow(/permission denied/);
  });

  test('family export is parent-only and scoped', async () => {
    await expect(db.asUser(IDS.parentB, (q) => q('select app.export_family($1)', [IDS.famA]))).rejects.toThrow(/not allowed/);
    await expect(db.asUser(IDS.ava, (q) => q('select app.export_family($1)', [IDS.famA]))).rejects.toThrow(/not allowed/);
    const [r] = await db.asUser(IDS.parentA, (q) => q<{ e: { children: { id: string }[] } }>('select app.export_family($1) e', [IDS.famA]));
    expect(r.e.children.map((c) => c.id).sort()).toEqual([IDS.childAva, IDS.childBen].sort());
  });

  test('reply writes are audit-logged', async () => {
    const rows = await db.asUser(IDS.parentA, (q) => q<{ action: string }>(`select action from audit_log where entity = 'student_replies'`));
    expect(rows.length).toBeGreaterThan(0);
  });
});
