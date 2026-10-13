/** Fiche d'établissement en ligne : horaires, liens des fiches tenues ailleurs et date de dernière vérification. */
export const sql = /* sql */ `
ALTER TABLE showcases ADD COLUMN hours jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE showcases ADD COLUMN listing_links jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE showcases ADD COLUMN listing_checked_at timestamptz;
`;
