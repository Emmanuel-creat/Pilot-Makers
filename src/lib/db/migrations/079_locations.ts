/** Matériel loué pour les chantiers : durée, tarif, restitution, coût reporté sur le chantier. */
export const sql = /* sql */ `
CREATE TABLE job_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  equipment text NOT NULL,
  renter text NOT NULL DEFAULT '',
  start_date date NOT NULL,
  end_date date NOT NULL,
  returned_on date,
  rate_cents bigint NOT NULL CHECK (rate_cents >= 0),
  period text NOT NULL CHECK (period IN ('jour', 'semaine', 'mois')),
  delivery_cents bigint NOT NULL DEFAULT 0 CHECK (delivery_cents >= 0),
  insurance_bp integer NOT NULL DEFAULT 0 CHECK (insurance_bp BETWEEN 0 AND 5000),
  reference text NOT NULL DEFAULT '',
  purchase_id uuid REFERENCES job_purchases(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (returned_on IS NULL OR returned_on >= start_date)
);
CREATE INDEX job_rentals_job ON job_rentals (job_id);
CREATE INDEX job_rentals_open ON job_rentals (org_id) WHERE returned_on IS NULL;
`;
