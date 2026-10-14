/** Paiement par étape validée en photo : jalons d'un devis accepté, photos d'avancement, validation par le client. */
export const sql = /* sql */ `
CREATE TABLE payment_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL,
  cumulative_bp integer NOT NULL CHECK (cumulative_bp > 0 AND cumulative_bp <= 10000),
  status text NOT NULL DEFAULT 'prevue' CHECK (status IN ('prevue', 'soumise', 'validee', 'contestee')),
  artisan_note text NOT NULL DEFAULT '',
  client_comment text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  decided_at timestamptz,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, position)
);
CREATE INDEX payment_stages_org ON payment_stages(org_id, status);
CREATE TABLE payment_stage_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES payment_stages(id) ON DELETE CASCADE,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_stage_photos_stage ON payment_stage_photos(stage_id, created_at);
`;
