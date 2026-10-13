/** Notes de frais : dépense photographiée par la personne, validée par l'encadrement puis remboursée. */
export const sql = /* sql */ `
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  expense_date date NOT NULL,
  merchant text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('repas', 'carburant', 'peage_parking', 'fournitures', 'hebergement', 'transport', 'autre')),
  amount_ttc_cents bigint NOT NULL CHECK (amount_ttc_cents > 0),
  vat_cents bigint NOT NULL DEFAULT 0 CHECK (vat_cents >= 0),
  payment text NOT NULL DEFAULT 'perso' CHECK (payment IN ('perso', 'entreprise')),
  note text NOT NULL DEFAULT '',
  photo bytea,
  photo_type text,
  photo_sha256 text,
  status text NOT NULL DEFAULT 'soumis' CHECK (status IN ('soumis', 'valide', 'refuse', 'rembourse')),
  review_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reimbursed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vat_cents < amount_ttc_cents)
);
CREATE INDEX expenses_org ON expenses (org_id, expense_date DESC);
CREATE INDEX expenses_user ON expenses (user_id, expense_date DESC);

ALTER TABLE job_purchases ADD COLUMN expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE;
`;
