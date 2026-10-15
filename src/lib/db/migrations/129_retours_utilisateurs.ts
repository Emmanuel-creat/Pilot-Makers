/** Retours des utilisateurs page par page : utile ou à améliorer, commentaire facultatif, suivi par l'équipe. */
export const sql = /* sql */ `
CREATE TABLE page_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area text NOT NULL,
  path text NOT NULL,
  useful boolean NOT NULL,
  comment text NOT NULL DEFAULT '',
  day date NOT NULL,
  status text NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'traite')),
  response text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, area, day)
);
CREATE INDEX page_feedback_recent ON page_feedback (created_at DESC);
`;
