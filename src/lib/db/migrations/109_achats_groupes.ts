/** Achats groupés entre membres d'un réseau : paliers de prix du fournisseur et engagements de quantité. */
export const sql = /* sql */ `
CREATE TABLE group_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  supplier text NOT NULL,
  unit text NOT NULL,
  base_price_cents integer NOT NULL CHECK (base_price_cents > 0),
  tiers jsonb NOT NULL DEFAULT '[]',
  deadline date NOT NULL,
  status text NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte', 'close', 'annulee')),
  final_price_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX group_purchases_network ON group_purchases(network_id, status);
CREATE TABLE group_purchase_commitments (
  purchase_id uuid NOT NULL REFERENCES group_purchases(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (purchase_id, org_id)
);
`;
