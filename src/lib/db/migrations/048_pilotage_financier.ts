/** Trésorerie prévisionnelle : solde bancaire et charges fixes mensuelles saisis par l'entreprise. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN treasury jsonb NOT NULL DEFAULT '{}';
`;
