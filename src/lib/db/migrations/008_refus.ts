/** Motif de refus d'un devis (liste analysable) et commentaires internes par ligne. */
export const sql = /* sql */ `
ALTER TABLE quotes ADD COLUMN refusal_reason text NOT NULL DEFAULT '';
ALTER TABLE quote_lines ADD COLUMN internal_note text NOT NULL DEFAULT '';
`;
