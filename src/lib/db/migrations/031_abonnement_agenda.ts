/** Abonnement d'agenda : lien secret par personne, lu par Google Agenda, Outlook ou Apple Calendrier. */
export const sql = /* sql */ `
CREATE TABLE calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  scope text NOT NULL DEFAULT 'moi' CHECK (scope IN ('moi', 'entreprise')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (org_id, user_id)
);
`;
