/** Barème des indemnités de déplacement du bâtiment saisi par l'entreprise. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN travel_rates jsonb NOT NULL DEFAULT '{}'::jsonb;
`;
