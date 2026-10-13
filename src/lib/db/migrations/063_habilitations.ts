/** Habilitations et formations de l'équipe, avec leur échéance de renouvellement. */
export const sql = /* sql */ `
CREATE TABLE member_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  obtained_on date,
  valid_until date,
  note text NOT NULL DEFAULT '',
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_certifications_org ON member_certifications (org_id, valid_until);
`;
