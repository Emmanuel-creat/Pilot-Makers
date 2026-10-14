/** Décompte général définitif d'un devis accepté : pénalités, envoi au client, réponse et état figé. */
export const sql = /* sql */ `
CREATE TABLE final_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  penalties_cents bigint NOT NULL DEFAULT 0 CHECK (penalties_cents >= 0),
  penalties_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'projet' CHECK (status IN ('projet', 'envoye', 'accepte', 'conteste')),
  snapshot jsonb,
  sent_at timestamptz,
  answered_at timestamptz,
  answer_note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id)
);
`;
