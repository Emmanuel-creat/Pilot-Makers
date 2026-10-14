/** Commandes groupées : plusieurs commandes de chantiers différents envoyées en une fois au même fournisseur. */
export const sql = /* sql */ `
CREATE TABLE purchase_order_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier text NOT NULL,
  delivery_address text NOT NULL DEFAULT '',
  delivery_date date,
  notes text NOT NULL DEFAULT '',
  sent_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
ALTER TABLE purchase_orders ADD COLUMN group_id uuid REFERENCES purchase_order_groups(id) ON DELETE SET NULL;
CREATE INDEX purchase_orders_group ON purchase_orders (group_id) WHERE group_id IS NOT NULL;
`;
