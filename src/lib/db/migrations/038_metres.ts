/** Métrés : cotes relevées et ouvertures déduites, conservées avec la ligne du devis. */
export const sql = /* sql */ `
ALTER TABLE quote_lines ADD COLUMN measure jsonb;
`;
