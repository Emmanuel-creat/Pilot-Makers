/** Tarifs de l'entreprise : taux horaires par qualification, barème des déplacements. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN pricing jsonb NOT NULL DEFAULT '{}'::jsonb;
`;
