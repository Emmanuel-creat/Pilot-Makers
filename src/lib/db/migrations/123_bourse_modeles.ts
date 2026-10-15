/** Bourse aux modèles de devis : modèles publiés par des artisans, cédés gratuitement ou vendus entre entreprises. */
export const sql = /* sql */ `
CREATE TABLE template_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL UNIQUE REFERENCES quote_templates(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'publie' CHECK (status IN ('publie', 'retire')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  trade text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents BETWEEN 0 AND 50000),
  data jsonb NOT NULL,
  line_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX template_listings_status ON template_listings (status, updated_at DESC);

CREATE TABLE template_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES template_listings(id) ON DELETE CASCADE,
  buyer_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('a_regler', 'regle')),
  price_cents integer NOT NULL,
  template_id uuid REFERENCES quote_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (listing_id, buyer_org_id)
);
CREATE INDEX template_purchases_buyer ON template_purchases (buyer_org_id);
`;
