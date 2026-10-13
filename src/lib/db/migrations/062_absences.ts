/** Congés et absences de l'équipe, affichés dans le planning. */
export const sql = /* sql */ `
CREATE TABLE member_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('conges', 'rtt', 'maladie', 'formation', 'autre')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX member_absences_range ON member_absences (org_id, start_date, end_date);
`;
