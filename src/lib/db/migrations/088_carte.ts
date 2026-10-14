/** Carte des clients : position de l'adresse du client, comme pour les chantiers. */
export const sql = /* sql */ `
ALTER TABLE customers ADD COLUMN latitude double precision;
ALTER TABLE customers ADD COLUMN longitude double precision;
ALTER TABLE customers ADD COLUMN geo_label text NOT NULL DEFAULT '';
`;
