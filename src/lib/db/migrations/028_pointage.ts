/** Pointage des heures par chantier, validation par l'encadrement et qualification de chaque membre. */
export const sql = /* sql */ `
ALTER TABLE memberships ADD COLUMN qualification text NOT NULL DEFAULT '';
CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  minutes integer NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 1440),
  note text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  status text NOT NULL DEFAULT 'saisi' CHECK (status IN ('saisi', 'valide', 'refuse')),
  review_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX time_entries_running ON time_entries (org_id, user_id) WHERE started_at IS NOT NULL AND ended_at IS NULL;
CREATE INDEX time_entries_period ON time_entries (org_id, work_date);
CREATE INDEX time_entries_job ON time_entries (job_id);
`;
