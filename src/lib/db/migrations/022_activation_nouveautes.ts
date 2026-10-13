/** Activation progressive des nouveautés par entreprise, et date de dernière lecture du journal des nouveautés. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN changelog_seen_at timestamptz;
`;
