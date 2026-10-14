/** Livraisons des commandes fournisseurs (bon de livraison, réserves) et retours de marchandise avec avoir. */
export const sql = /* sql */ `
CREATE TABLE order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  delivered_on date NOT NULL,
  note_number text NOT NULL DEFAULT '',
  issues text NOT NULL DEFAULT '',
  lines jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_deliveries_order ON order_deliveries (order_id, delivered_on);
CREATE TABLE supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
  quantity_milli bigint NOT NULL CHECK (quantity_milli > 0),
  reason text NOT NULL CHECK (reason IN ('casse', 'erreur', 'defaut', 'surplus')),
  notes text NOT NULL DEFAULT '',
  restocking_bp integer NOT NULL DEFAULT 0 CHECK (restocking_bp BETWEEN 0 AND 5000),
  status text NOT NULL DEFAULT 'a_reprendre' CHECK (status IN ('a_reprendre', 'repris', 'avoir_recu')),
  collected_on date,
  credit_cents bigint,
  credit_reference text NOT NULL DEFAULT '',
  purchase_id uuid REFERENCES job_purchases(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_returns_order ON supplier_returns (order_id);
CREATE INDEX supplier_returns_open ON supplier_returns (org_id) WHERE status <> 'avoir_recu';
`;
