/** Tarifs préférentiels pour les apprentis et les créateurs d'entreprise, accordés après vérification. */
export const sql = /* sql */ `
CREATE TABLE pricing_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('apprenti', 'createur')),
  status text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'accorde', 'refuse')),
  details jsonb NOT NULL DEFAULT '{}',
  percent integer NOT NULL DEFAULT 0,
  valid_until date,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT ''
);
CREATE INDEX pricing_benefits_status ON pricing_benefits (status);
`;
