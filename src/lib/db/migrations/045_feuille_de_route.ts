/** Feuille de route publique : chantiers annoncés par l'équipe et votes des utilisateurs (un par compte et par sujet). */
export const sql = /* sql */ `
CREATE TABLE roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idee' CHECK (status IN ('idee','prevu','en_cours','livre')),
  delivered_on date,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roadmap_votes (
  item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
`;
