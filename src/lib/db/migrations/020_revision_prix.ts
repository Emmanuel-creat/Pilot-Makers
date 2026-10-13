/** Révision de prix : clause du devis et valeurs des index BT saisies par l'entreprise. */
export const sql = /* sql */ `
ALTER TABLE quotes ADD COLUMN price_revision jsonb;

CREATE TABLE price_indexes (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  month text NOT NULL,
  value_centi bigint NOT NULL CHECK (value_centi > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, code, month)
);
`;
