/** Chantiers : créés depuis un devis accepté, avec leurs tâches et leur avancement. */
export const sql = /* sql */ `
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'a_planifier' CHECK (status IN ('a_planifier', 'en_cours', 'termine', 'receptionne')),
  site_line1 text NOT NULL DEFAULT '',
  site_line2 text NOT NULL DEFAULT '',
  site_postal_code text NOT NULL DEFAULT '',
  site_city text NOT NULL DEFAULT '',
  access_notes text NOT NULL DEFAULT '',
  access_codes text NOT NULL DEFAULT '',
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX jobs_quote ON jobs (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX jobs_org ON jobs (org_id, status);

CREATE TABLE job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT '',
  label text NOT NULL,
  quantity text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  weight_cents bigint NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  progress_bp integer NOT NULL DEFAULT 0 CHECK (progress_bp BETWEEN 0 AND 10000),
  done_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_tasks_job ON job_tasks (job_id, position);
`;
