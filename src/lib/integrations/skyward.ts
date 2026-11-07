/**
 * Skyward adapter — STATUS: WAITING FOR INTEGRATION.
 * Skyward does not offer a universal public parent API. Access depends on the district enabling an approved
 * interface (often OneRoster / Ed-Fi through the district or a certified partner). Until then, families
 * import official grades via CSV export from Skyward Family Access.
 * This adapter intentionally never accepts or stores a username/password and never scrapes pages.
 */
import type { ProviderAdapter } from '../domain/sync';

export function skywardAdapter(opts: { districtApiBaseUrl?: string; childName: string }): ProviderAdapter<never> {
  return {
    name: 'Skyward',
    describeScope: () => `Official report-card and quarter grades for ${opts.childName}`,
    async checkAuth() {
      return { ok: false, reason: opts.districtApiBaseUrl
        ? 'District API configured but adapter not yet implemented for this district'
        : 'District has not enabled an approved Skyward API. Use CSV import from Family Access.' };
    },
    async fetchAll(): Promise<never> { throw new Error('Skyward integration pending district approval'); },
  };
}
