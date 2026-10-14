/** Veille réglementaire : évolutions déjà lues par l'entreprise. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN regulatory_seen text[] NOT NULL DEFAULT '{}';
`;
