/** Demandes de financement d'équipement : besoin, simulation retenue et suivi de la réponse du financeur. */
export const sql = /* sql */ `
CREATE TABLE financing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'autre',
  supplier text NOT NULL DEFAULT '',
  quote_ref text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  down_payment_cents bigint NOT NULL DEFAULT 0 CHECK (down_payment_cents >= 0),
  kind text NOT NULL DEFAULT 'credit_bail',
  months integer NOT NULL DEFAULT 48 CHECK (months BETWEEN 6 AND 120),
  rate_bp integer NOT NULL DEFAULT 550 CHECK (rate_bp BETWEEN 0 AND 3000),
  residual_bp integer NOT NULL DEFAULT 0 CHECK (residual_bp BETWEEN 0 AND 5000),
  purpose text NOT NULL DEFAULT '',
  lender text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'envoyee', 'accordee', 'refusee')),
  sent_at timestamptz,
  decided_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financing_requests_org ON financing_requests (org_id, created_at DESC);
`;
