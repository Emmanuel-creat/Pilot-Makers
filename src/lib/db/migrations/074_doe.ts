/** Dossier des ouvrages exécutés : conseils d'entretien propres au chantier, repris dans le dossier remis au client. */
export const sql = /* sql */ `
ALTER TABLE jobs ADD COLUMN doe_notes text NOT NULL DEFAULT '';
`;
