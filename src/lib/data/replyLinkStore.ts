import type { Db } from './engine';
import type { ReplyLinkStore } from '../domain/replyTokens';

/**
 * Reply links are opened by students who may not be logged in on that device, so the signed token itself is the
 * credential. It is narrowly scoped: one assignment, one child, one family, unrevoked nonce, unexpired.
 * The insert re-checks that the assignment really belongs to that child and family.
 */
export function dbReplyLinkStore(db: Db): ReplyLinkStore {
  return {
    async isNonceActive(nonce, now) {
      const r = await db.asService((q) => q(`select 1 from reply_links where nonce = $1 and revoked_at is null and expires_at > $2`, [nonce, now.toISOString()]));
      return r.length > 0;
    },
    async recordReply(p, status, note) {
      await db.asService(async (q) => {
        const ok = await q(`select 1 from reply_links l join assignments a on a.id = l.assignment_id
            where l.nonce = $1 and l.assignment_id = $2 and l.child_id = $3 and l.family_id = $4 and a.child_id = $3 and a.family_id = $4`,
          [p.n, p.aid, p.cid, p.fid]);
        if (!ok.length) throw new Error('link does not match assignment');
        await q(`insert into student_replies(family_id, child_id, assignment_id, status, note, channel, author_user_id) values ($1,$2,$3,$4,$5,'email_link',$6)`,
          [p.fid, p.cid, p.aid, status, note, p.uid]);
        await q(`update reply_links set uses = uses + 1 where nonce = $1`, [p.n]);
      });
    },
  };
}
