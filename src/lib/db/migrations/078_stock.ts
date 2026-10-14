/** Stock du dépôt et des véhicules : articles suivis, mouvements, dotation de chaque véhicule. */
export const sql = /* sql */ `
CREATE TABLE stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
  label text NOT NULL,
  unit text NOT NULL DEFAULT 'u',
  unit_cost4 bigint,
  supplier text NOT NULL DEFAULT '',
  min_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  reorder_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_items_org ON stock_items (org_id, lower(label));

CREATE TABLE stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  location text NOT NULL,
  qty numeric(12,3) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('entree', 'sortie', 'transfert', 'inventaire')),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_moves_item ON stock_moves (org_id, item_id, created_at DESC);

CREATE TABLE stock_vehicle_kits (
  item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES org_vehicles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  target_qty numeric(12,3) NOT NULL CHECK (target_qty > 0),
  PRIMARY KEY (item_id, vehicle_id)
);
`;
