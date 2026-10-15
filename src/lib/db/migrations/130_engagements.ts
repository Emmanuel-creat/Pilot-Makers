export const sql = /* sql */ `
ALTER TABLE showcases ADD COLUMN commitments jsonb NOT NULL DEFAULT '[]'::jsonb;
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
ALTER TABLE showcases DROP COLUMN commitments;
`;
