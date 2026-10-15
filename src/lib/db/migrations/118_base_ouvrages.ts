/** Base ouverte et collaborative des ouvrages : fiches techniques partagées sous licence ouverte, sans prix. */
export const sql = /* sql */ `
CREATE TABLE open_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  trade text NOT NULL,
  title text NOT NULL,
  unit text NOT NULL,
  description text NOT NULL DEFAULT '',
  composition jsonb NOT NULL DEFAULT '[]',
  labour_minutes integer CHECK (labour_minutes IS NULL OR labour_minutes BETWEEN 0 AND 100000),
  refs text NOT NULL DEFAULT '',
  derived_from uuid REFERENCES open_works(id) ON DELETE SET NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX open_works_trade ON open_works (trade, created_at DESC);
CREATE TABLE open_work_votes (
  work_id uuid NOT NULL REFERENCES open_works(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (work_id, user_id)
);
CREATE TABLE open_work_reports (
  work_id uuid NOT NULL REFERENCES open_works(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  PRIMARY KEY (work_id, user_id)
);
CREATE TABLE open_work_imports (
  work_id uuid NOT NULL REFERENCES open_works(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, org_id)
);
`;
