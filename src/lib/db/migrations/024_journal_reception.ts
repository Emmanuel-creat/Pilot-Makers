/** Journal de chantier (notes et photos datées), procès-verbal de réception et suivi des réserves. */
export const sql = /* sql */ `
CREATE TABLE job_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  photo bytea,
  photo_type text,
  photo_sha256 text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_journal_job ON job_journal (job_id, taken_at DESC);

CREATE TABLE job_receptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('sans_reserve', 'avec_reserves', 'refus')),
  reception_date date NOT NULL,
  snapshot jsonb NOT NULL,
  pdf bytea NOT NULL,
  pdf_sha256 text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  location text NOT NULL DEFAULT '',
  due_date date,
  lifted_at timestamptz,
  lifted_note text NOT NULL DEFAULT '',
  lifted_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX job_reserves_job ON job_reserves (job_id, position);
`;
