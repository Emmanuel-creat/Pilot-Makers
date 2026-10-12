/** Lignes en option choisies par le client à l'acceptation. */
export const sql = /* sql */ `
ALTER TABLE quote_lines ADD COLUMN optional boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN accepted_options jsonb NOT NULL DEFAULT '[]'::jsonb;
`;
