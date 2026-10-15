/** Note de confiance : l'artisan choisit de l'afficher ou non sur sa vitrine. */
export const sql = /* sql */ `
ALTER TABLE showcases ADD COLUMN show_trust boolean NOT NULL DEFAULT false;
`;
