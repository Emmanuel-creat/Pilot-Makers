export const sql = `
ALTER TABLE quotes ADD COLUMN foreign_currency jsonb;
`;
