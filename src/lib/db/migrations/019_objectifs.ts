/** Objectifs mensuels de l'entreprise (montant signé, nombre de devis envoyés). */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN goals jsonb NOT NULL DEFAULT '{}'::jsonb;
`;
