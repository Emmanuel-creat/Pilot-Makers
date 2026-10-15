/** Formation continue intégrée : résultat de chaque personne aux modules. */
export const sql = /* sql */ `
CREATE TABLE training_results (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 3),
  passed boolean NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id, module_id)
);
`;
