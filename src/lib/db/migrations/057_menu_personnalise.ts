/** Menu personnalisé de chaque utilisateur : briques affichées, ordre et raccourcis du téléphone. */
export const sql = /* sql */ `
ALTER TABLE users ADD COLUMN menu jsonb;
`;
