/** Plan de prévention de chaque chantier : risques retenus, secours et consignes. */
export const sql = /* sql */ `
CREATE TABLE job_safety_plans (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risks text[] NOT NULL DEFAULT '{}',
  building_year integer CHECK (building_year IS NULL OR building_year BETWEEN 1000 AND 2100),
  manager text NOT NULL DEFAULT '',
  first_aider text NOT NULL DEFAULT '',
  hospital text NOT NULL DEFAULT '',
  meeting_point text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_safety_plans_org ON job_safety_plans (org_id);
`;
