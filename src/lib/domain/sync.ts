/**
 * Honest synchronization rules, independent of any provider.
 *  1. Verify authentication BEFORE fetching anything.
 *  2. If auth fails: mark "Reconnect needed", keep the last good data and its timestamp, explain what wasn't refreshed.
 *  3. Never write partial results from a failed run over good data.
 *  4. Freshness labels come from last_success_at — never from last_attempt_at.
 */
export type ConnectionStatus = 'connected' | 'reconnect_needed' | 'error' | 'pending_district' | 'not_configured';

export interface ConnectionState {
  status: ConnectionStatus; lastAttemptAt: Date | null; lastSuccessAt: Date | null;
  lastError: string | null; notRefreshed: string | null;
}

export interface ProviderAdapter<TData> {
  name: string;
  checkAuth(): Promise<{ ok: true } | { ok: false; reason: string }>;
  fetchAll(): Promise<TData>;
  describeScope(): string; // e.g. "Assignments, scores and course grades for Ava"
}

export type SyncOutcome<T> =
  | { outcome: 'success'; state: ConnectionState; data: T }
  | { outcome: 'auth_failed' | 'error'; state: ConnectionState; data: null };

export async function runSync<T>(adapter: ProviderAdapter<T>, prev: ConnectionState, now: Date): Promise<SyncOutcome<T>> {
  const failed = (outcome: 'auth_failed' | 'error', status: ConnectionStatus, reason: string): SyncOutcome<T> => ({
    outcome, data: null,
    state: {
      ...prev, status, lastAttemptAt: now, lastError: reason,
      lastSuccessAt: prev.lastSuccessAt, // unchanged: the old data is still the newest good data
      notRefreshed: `${adapter.describeScope()} were not refreshed. Showing data from the last successful sync${prev.lastSuccessAt ? ` (${prev.lastSuccessAt.toISOString()})` : ''}.`,
    },
  });
  let auth;
  try { auth = await adapter.checkAuth(); } catch (e) { return failed('error', 'error', `Auth check failed: ${(e as Error).message}`); }
  if (!auth.ok) return failed('auth_failed', 'reconnect_needed', auth.reason);
  try {
    const data = await adapter.fetchAll();
    return { outcome: 'success', data, state: { status: 'connected', lastAttemptAt: now, lastSuccessAt: now, lastError: null, notRefreshed: null } };
  } catch (e) {
    return failed('error', 'error', (e as Error).message);
  }
}

export type Freshness = 'current' | 'stale' | 'reconnect_needed' | 'never_synced' | 'not_connected';
export const STALE_AFTER_HOURS = 24;

export function freshness(s: ConnectionState, now: Date): Freshness {
  if (s.status === 'pending_district' || s.status === 'not_configured') return 'not_connected';
  if (!s.lastSuccessAt) return 'never_synced';
  if (s.status === 'reconnect_needed') return 'reconnect_needed';
  if (s.status === 'error') return 'stale';
  return now.getTime() - s.lastSuccessAt.getTime() > STALE_AFTER_HOURS * 3600_000 ? 'stale' : 'current';
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Up to date', stale: 'Stale', reconnect_needed: 'Reconnect needed',
  never_synced: 'Never synced', not_connected: 'Not connected',
};
