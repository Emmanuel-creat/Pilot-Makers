/** Espace expert-comptable (fonction en lecture seule) et plan comptable de l'entreprise. */
export const sql = /* sql */ `
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_job_function_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_job_function_check CHECK (job_function IN ('gerant', 'conducteur', 'secretariat', 'ouvrier', 'comptable'));
ALTER TABLE organizations ADD COLUMN accounting jsonb NOT NULL DEFAULT '{}';
`;
