/** Interventions des corps de métier sur un chantier : qui, quand, après quoi. */
export const sql = /* sql */ `
CREATE TABLE job_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trade text NOT NULL,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  after_id uuid REFERENCES job_interventions(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX job_interventions_job ON job_interventions (job_id);
ALTER TABLE jobs ADD COLUMN planning_sent_at timestamptz;
`;
