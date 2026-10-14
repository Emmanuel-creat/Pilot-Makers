/** Réseaux et groupements d'artisans : membres et bibliothèque d'ouvrages partagée entre eux. */
export const sql = /* sql */ `
CREATE TABLE networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  join_code text NOT NULL UNIQUE,
  created_by_org uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE network_members (
  network_id uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'membre' CHECK (role IN ('animateur', 'membre')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network_id, org_id)
);
CREATE INDEX network_members_org ON network_members (org_id);

CREATE TABLE network_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  unit text NOT NULL,
  unit_price4 bigint,
  vat_bp integer NOT NULL,
  duration_minutes integer,
  tags text[] NOT NULL DEFAULT '{}',
  imports integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_id, source_item_id)
);
CREATE INDEX network_items_network ON network_items (network_id, lower(name));
`;
