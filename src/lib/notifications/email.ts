export interface EmailProvider {
  name: string;
  send(m: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<string>;
}

/** MOCKED provider: records emails in memory/console. Used when RESEND_API_KEY is not set. */
export function logEmailProvider(sink: { to: string; subject: string; text: string }[] = []): EmailProvider & { sink: typeof sink } {
  return {
    name: 'log (mock)', sink,
    async send(m) { sink.push(m); if (process.env.NODE_ENV !== 'test') console.log(`[email:mock] to=${m.to} subject=${m.subject}\n${m.text}`); return `mock-${sink.length}`; },
  };
}

/** Resend (https://resend.com). Passes our idempotency key so provider-side retries also can't duplicate. */
export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: 'resend',
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.idempotencyKey.slice(0, 256) },
        body: JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return ((await res.json()) as { id: string }).id;
    },
  };
}

export function defaultEmailProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY;
  return key ? resendProvider(key, process.env.EMAIL_FROM || 'OnTrack Grades <no-reply@example.com>') : logEmailProvider();
}
