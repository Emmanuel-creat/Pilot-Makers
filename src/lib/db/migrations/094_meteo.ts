/** Météo des travaux extérieurs : type de travaux du chantier et prévisions mises en cache par zone. */
export const sql = /* sql */ `
ALTER TABLE jobs ADD COLUMN outdoor_work text NOT NULL DEFAULT '';

CREATE TABLE weather_forecasts (
  lat numeric(5,1) NOT NULL,
  lng numeric(5,1) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  days jsonb NOT NULL,
  PRIMARY KEY (lat, lng)
);
`;
