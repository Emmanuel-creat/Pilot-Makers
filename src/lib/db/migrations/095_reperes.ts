/** Participation volontaire aux repères anonymes entre entreprises (fourchettes de prix, indicateurs). */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN benchmark_optin_at timestamptz;
CREATE INDEX organizations_benchmark ON organizations (benchmark_optin_at) WHERE benchmark_optin_at IS NOT NULL;
`;
