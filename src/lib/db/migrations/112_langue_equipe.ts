/** Langue choisie par chaque membre pour l'écran « Ma journée » des équipes de chantier. */
export const sql = /* sql */ `
ALTER TABLE users ADD COLUMN team_locale text NOT NULL DEFAULT 'fr';
`;
