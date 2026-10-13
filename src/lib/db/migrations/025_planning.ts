/** Planning : véhicules de l'entreprise et affectations des équipes et véhicules aux chantiers, jour par jour. */
export const sql = /* sql */ `
CREATE TABLE org_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  plate text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_vehicles_org ON org_vehicles (org_id);

CREATE TABLE job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('user', 'vehicle')),
  resource_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX job_assignments_range ON job_assignments (org_id, start_date, end_date);
CREATE INDEX job_assignments_job ON job_assignments (job_id);
`;
