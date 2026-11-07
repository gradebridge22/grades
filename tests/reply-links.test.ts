import { describe, test, expect, beforeAll } from 'vitest';
import { createPglite, type Db } from '../src/lib/data/engine';
import { handleReplyLink, signReplyToken } from '../src/lib/domain/replyTokens';
import { dbReplyLinkStore } from '../src/lib/data/replyLinkStore';
import { IDS } from './helpers';

let db: Db; let token: string; let nonce: string;
const count = () => db.asService((q) => q<{ n: number }>(`select count(*)::int n from student_replies where assignment_id = $1`, [IDS.osmosis])).then((r) => r[0].n);

beforeAll(async () => {
  db = await createPglite();
  const s = signReplyToken({ aid: IDS.osmosis, cid: IDS.childAva, fid: IDS.famA, uid: IDS.ava });
  token = s.token; nonce = s.payload.n;
  await db.asService((q) => q(`insert into reply_links(nonce, family_id, child_id, assignment_id, expires_at) values ($1,$2,$3,$4,$5)`,
    [nonce, IDS.famA, IDS.childAva, IDS.osmosis, new Date(s.payload.exp * 1000).toISOString()]));
});

describe('Email link previews cannot submit student replies', () => {
  test('GET and HEAD (scanners, link previews) never record', async () => {
    const before = await count();
    const store = dbReplyLinkStore(db);
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const r = await handleReplyLink({ method, token, query: { s: 'already_did' } }, store);
      expect(r.kind).toBe('render_confirm');
    }
    expect(await count()).toBe(before);
  });
  test('POST without explicit confirmation does not record', async () => {
    const before = await count();
    const r = await handleReplyLink({ method: 'POST', token, form: { status: 'already_did' } }, dbReplyLinkStore(db));
    expect(r.kind).toBe('error');
    expect(await count()).toBe(before);
  });
  test('explicit confirmation records exactly one reply, via email_link channel', async () => {
    const before = await count();
    const r = await handleReplyLink({ method: 'POST', token, form: { status: 'did_on_paper', confirm: 'yes', note: 'turned in Monday' } }, dbReplyLinkStore(db));
    expect(r).toEqual({ kind: 'recorded', status: 'did_on_paper' });
    expect(await count()).toBe(before + 1);
  });
  test('tampered, expired and revoked tokens are rejected', async () => {
    const store = dbReplyLinkStore(db);
    const bad = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
    expect((await handleReplyLink({ method: 'POST', token: bad, form: { status: 'other', confirm: 'yes' } }, store)).kind).toBe('error');
    const old = signReplyToken({ aid: IDS.osmosis, cid: IDS.childAva, fid: IDS.famA, uid: IDS.ava, now: new Date(Date.now() - 100 * 3600_000), ttlHours: 72 });
    const r = await handleReplyLink({ method: 'GET', token: old.token }, store);
    expect(r).toMatchObject({ kind: 'error', status: 410 });
    await db.asService((q) => q(`update reply_links set revoked_at = now() where nonce = $1`, [nonce]));
    expect((await handleReplyLink({ method: 'POST', token, form: { status: 'other', confirm: 'yes' } }, store)).kind).toBe('error');
  });
  test('a token cannot be replayed against another family\'s assignment', async () => {
    const s = signReplyToken({ aid: IDS.oakAssignment, cid: IDS.childAva, fid: IDS.famA, uid: IDS.ava });
    await db.asService((q) => q(`insert into reply_links(nonce, family_id, child_id, assignment_id, expires_at) values ($1,$2,$3,$4, now() + interval '1 day')`,
      [s.payload.n, IDS.famA, IDS.childAva, IDS.osmosis]));
    await expect(handleReplyLink({ method: 'POST', token: s.token, form: { status: 'other', confirm: 'yes' } }, dbReplyLinkStore(db))).rejects.toThrow();
  });
});
