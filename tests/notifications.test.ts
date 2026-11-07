import { describe, test, expect, beforeAll } from 'vitest';
import { createPglite, type Db } from '../src/lib/data/engine';
import { planAndEnqueue, sendDue } from '../src/lib/notifications/jobs';
import { logEmailProvider, type EmailProvider } from '../src/lib/notifications/email';
import { syncConnection } from '../src/lib/integrations/syncService';
import { IDS } from './helpers';

const APP = 'https://app.example.test';
let db: Db;
beforeAll(async () => { db = await createPglite(); });

describe('Repeated syncs do not duplicate emails', () => {
  test('plan+enqueue+send three times after three syncs -> each email sent once', async () => {
    const mail = logEmailProvider();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await syncConnection(db, IDS.canvasConn, { name: 'fake', describeScope: () => 'x', checkAuth: async () => ({ ok: true }), fetchAll: async () => null }, () => [], now);
      await planAndEnqueue(db, now, APP);
      await sendDue(db, mail, new Date(+now + 24 * 3600_000), APP); // far enough ahead to pass quiet hours
    }
    expect(mail.sink.length).toBeGreaterThan(0);
    const keys = await db.asService((q) => q<{ k: string; n: number }>(`select idempotency_key k, count(*)::int n from notifications group by 1 having count(*) > 1`));
    expect(keys).toHaveLength(0);
    const subjects = mail.sink.map((m) => `${m.to}|${m.subject}`);
    expect(new Set(subjects).size).toBe(subjects.length);
    const logged = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from delivery_log where outcome = 'sent'`));
    expect(logged[0].n).toBeGreaterThanOrEqual(mail.sink.length);
  });

  test('a failed send is retried with backoff and still sent only once', async () => {
    const db2 = await createPglite();
    let calls = 0; const sent: string[] = [];
    const flaky: EmailProvider = { name: 'flaky', async send(m) { calls++; if (calls === 1) throw new Error('SMTP 503'); sent.push(m.idempotencyKey); return 'ok'; } };
    const now = new Date();
    await planAndEnqueue(db2, now, APP);
    const later = new Date(+now + 24 * 3600_000);
    await sendDue(db2, flaky, later, APP, 1);
    await sendDue(db2, flaky, new Date(+later + 10 * 60_000), APP);
    await sendDue(db2, flaky, new Date(+later + 20 * 60_000), APP);
    expect(new Set(sent).size).toBe(sent.length);
    const fails = await db2.asService((q) => q(`select * from delivery_log where outcome = 'failed'`));
    expect(fails).toHaveLength(1);
  });

  test('no consent -> no email is ever queued for that user', async () => {
    const rows = await db.asService((q) => q(`select * from notifications where recipient_user_id = $1 and channel = 'email'`, [IDS.guardianA]));
    expect(rows).toHaveLength(0); // the demo guardian never consented to email
  });

  test('quiet hours defer delivery', async () => {
    const rows = await db.asService((q) => q<{ s: string; tz: string }>(`select n.scheduled_for s, f.timezone tz from notifications n join families f on f.id = n.family_id`));
    for (const r of rows) {
      const h = Number(new Date(r.s).toLocaleString('en-US', { timeZone: r.tz, hour: 'numeric', hour12: false }));
      expect(h >= 7 && h < 21).toBe(true);
    }
  });
});
