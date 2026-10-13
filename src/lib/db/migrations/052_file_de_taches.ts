/** File de tâches en arrière-plan, avec nouveaux essais espacés et tâches abandonnées visibles par l'administration. */
export const sql = /* sql */ `
CREATE TABLE background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX background_jobs_due ON background_jobs(run_at) WHERE status IN ('pending', 'running');
`;
