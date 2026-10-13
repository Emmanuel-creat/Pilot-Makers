/** Itinéraires : position des chantiers et du dépôt de l'entreprise, pour estimer les trajets de la journée. */
export const sql = /* sql */ `
ALTER TABLE jobs ADD COLUMN latitude double precision;
ALTER TABLE jobs ADD COLUMN longitude double precision;
ALTER TABLE jobs ADD COLUMN geo_source text NOT NULL DEFAULT '' CHECK (geo_source IN ('', 'adresse', 'gps'));
ALTER TABLE jobs ADD COLUMN geo_label text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN latitude double precision;
ALTER TABLE organizations ADD COLUMN longitude double precision;
ALTER TABLE organizations ADD COLUMN geo_label text NOT NULL DEFAULT '';
`;
