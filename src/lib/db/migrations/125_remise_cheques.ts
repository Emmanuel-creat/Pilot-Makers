/** Bordereaux de remise de chèques en banque : chaque chèque encaissé n'est remis qu'une fois. */
export const sql = /* sql */ `
CREATE TABLE cheque_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number integer NOT NULL,
  deposited_on date NOT NULL,
  total_cents bigint NOT NULL,
  cheque_count integer NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
ALTER TABLE invoice_payments ADD COLUMN deposit_id uuid REFERENCES cheque_deposits(id) ON DELETE SET NULL;
CREATE INDEX invoice_payments_deposit ON invoice_payments (deposit_id);
`;
