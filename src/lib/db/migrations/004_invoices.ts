export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN invoice_prefix text NOT NULL DEFAULT 'FA';
ALTER TABLE organizations ADD COLUMN next_invoice_seq integer NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN credit_prefix text NOT NULL DEFAULT 'AV';
ALTER TABLE organizations ADD COLUMN next_credit_seq integer NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN invoice_due_days integer NOT NULL DEFAULT 30;
ALTER TABLE organizations ADD COLUMN late_penalty_text text NOT NULL DEFAULT 'Pénalités de retard : taux d''intérêt de la Banque centrale européenne majoré de 10 points, exigibles dès le lendemain de la date d''échéance.';
ALTER TABLE organizations ADD COLUMN invoice_reminder_settings jsonb NOT NULL DEFAULT '{"enabled": false, "days": [3, 15, 30]}'::jsonb;
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('deposit','final','credit_note')),
  number text NOT NULL,
  credited_invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT '',
  issue_date date NOT NULL,
  due_date date NOT NULL,
  snapshot jsonb NOT NULL,
  pdf bytea NOT NULL,
  pdf_sha256 text NOT NULL,
  snapshot_sha256 text NOT NULL,
  total_ht_cents bigint NOT NULL,
  total_vat_cents bigint NOT NULL,
  total_ttc_cents bigint NOT NULL,
  amount_due_cents bigint NOT NULL,
  paid_cents bigint NOT NULL DEFAULT 0,
  credited_cents bigint NOT NULL DEFAULT 0,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  sent_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (org_id, number)
);
CREATE INDEX invoices_org_date ON invoices (org_id, issue_date DESC);
CREATE INDEX invoices_quote ON invoices (quote_id);
CREATE TABLE invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('virement','cheque','carte','especes','prelevement','autre')),
  reference text NOT NULL DEFAULT '',
  canceled_at timestamptz,
  canceled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_payments_invoice ON invoice_payments (invoice_id);
ALTER TABLE emails ADD COLUMN attachment_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE emails ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
`;
