/** Autoliquidation de la TVA en sous-traitance et retenue de garantie. */
export const sql = /* sql */ `
ALTER TABLE quotes ADD COLUMN reverse_charge boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN retention_percent text NOT NULL DEFAULT '';
`;
