/** Opérations des relevés bancaires importés, rapprochées des factures encaissées. */
export const sql = /* sql */ `
CREATE TABLE bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booked_on date NOT NULL,
  amount_cents bigint NOT NULL,
  label text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  counterparty text NOT NULL DEFAULT '',
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'a_rapprocher' CHECK (status IN ('a_rapprocher', 'rapproche', 'ignore', 'depense')),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES invoice_payments(id) ON DELETE SET NULL,
  matched_by text CHECK (matched_by IN ('auto', 'manuel')),
  imported_by uuid REFERENCES users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, fingerprint)
);
CREATE INDEX bank_transactions_org ON bank_transactions(org_id, status, booked_on DESC);
`;
