/** Suivi des garanties après réception : libération de la retenue de garantie et rappels déjà envoyés. */
export const sql = /* sql */ `
ALTER TABLE job_receptions ADD COLUMN retention_released_at timestamptz;
ALTER TABLE job_receptions ADD COLUMN retention_release_note text NOT NULL DEFAULT '';
ALTER TABLE job_receptions ADD COLUMN reminders_sent jsonb NOT NULL DEFAULT '[]'::jsonb;
`;
