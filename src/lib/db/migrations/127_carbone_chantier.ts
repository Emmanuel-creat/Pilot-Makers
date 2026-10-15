/** Bilan carbone du chantier : distance aller-retour depuis le dépôt et véhicule utilisé. */
export const sql = /* sql */ `
ALTER TABLE jobs ADD COLUMN carbon_trip_km numeric(7,1) CHECK (carbon_trip_km IS NULL OR carbon_trip_km BETWEEN 0 AND 2000);
ALTER TABLE jobs ADD COLUMN carbon_vehicle text NOT NULL DEFAULT 'utilitaire_diesel';
ALTER TABLE jobs ADD COLUMN carbon_trips integer CHECK (carbon_trips IS NULL OR carbon_trips BETWEEN 0 AND 1000);
`;
