/** Mode absence : période, message aux clients et contact de secours pour les urgences. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN away_from date;
ALTER TABLE organizations ADD COLUMN away_to date;
ALTER TABLE organizations ADD COLUMN away_message text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN away_backup_name text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN away_backup_phone text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN away_backup_email text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD CONSTRAINT organizations_away_period CHECK (away_to IS NULL OR away_from IS NULL OR away_to >= away_from);
`;
