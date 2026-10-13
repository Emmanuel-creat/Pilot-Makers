/** Tarifs fournisseurs importés, référence fournisseur des articles et alertes de marge sur hausse des prix d'achat. */
export const sql = /* sql */ `
ALTER TABLE catalog_items ADD COLUMN supplier_ref text NOT NULL DEFAULT '';

CREATE TABLE supplier_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier text NOT NULL,
  reference text NOT NULL,
  ean text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  net_price4 bigint NOT NULL,
  list_price4 bigint,
  discount_bp integer,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, supplier, reference)
);

CREATE TABLE cost_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  supplier text NOT NULL,
  old_cost4 bigint,
  new_cost4 bigint NOT NULL,
  price4 bigint NOT NULL,
  margin_bp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz
);
CREATE INDEX cost_alerts_open ON cost_alerts(org_id, created_at DESC) WHERE dismissed_at IS NULL;
`;
