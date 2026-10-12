/** Lieu de conclusion du contrat, pour le droit de rétractation du client consommateur. */
export const sql = /* sql */ `
ALTER TABLE quotes ADD COLUMN contract_place text NOT NULL DEFAULT 'auto';
`;
