/** Évacuations de déchets de chaque chantier : base du registre chronologique des déchets sortants. */
export const sql = /* sql */ `
CREATE TABLE job_waste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  removed_on date NOT NULL,
  category text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit IN ('t', 'm3', 'kg')),
  destination text NOT NULL DEFAULT '',
  carrier text NOT NULL DEFAULT '',
  slip_ref text NOT NULL DEFAULT '',
  sorted boolean NOT NULL DEFAULT false,
  cost_cents bigint NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_waste_job ON job_waste (job_id, removed_on);
CREATE INDEX job_waste_org ON job_waste (org_id, removed_on);
`;
