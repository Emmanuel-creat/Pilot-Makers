/** Restes de matériaux en fin de chantier : quantité, valeur et devenir (stock, réemploi, déchet). */
export const sql = /* sql */ `
CREATE TABLE job_leftovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  order_line_id uuid REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  label text NOT NULL,
  unit text NOT NULL DEFAULT 'u',
  quantity_milli bigint NOT NULL CHECK (quantity_milli > 0),
  unit_cost_cents bigint NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  fate text NOT NULL CHECK (fate IN ('stock', 'reemploi', 'dechet')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_leftovers_job ON job_leftovers (job_id);
CREATE INDEX job_leftovers_org ON job_leftovers (org_id, created_at);
`;
