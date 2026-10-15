export const sql = /* sql */ `
ALTER TABLE showcases ADD COLUMN commitments jsonb NOT NULL DEFAULT '[]'::jsonb;
`;
