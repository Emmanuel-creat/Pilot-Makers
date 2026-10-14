/** Déclarations à la caisse de congés payés du bâtiment, préparées chaque mois depuis le pointage. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN leave_fund jsonb NOT NULL DEFAULT '{}';
CREATE TABLE leave_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  rate_bp integer NOT NULL CHECK (rate_bp BETWEEN 0 AND 5000),
  lines jsonb NOT NULL DEFAULT '[]',
  total_gross_cents bigint NOT NULL DEFAULT 0,
  contribution_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'preparee' CHECK (status IN ('preparee', 'transmise')),
  sent_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, period)
);
`;
