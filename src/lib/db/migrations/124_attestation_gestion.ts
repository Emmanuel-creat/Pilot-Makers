/** Examen final du parcours de gestion et attestations de réussite vérifiables. */
export const sql = /* sql */ `
CREATE TABLE course_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id text NOT NULL,
  seed integer NOT NULL,
  score integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
CREATE INDEX course_exams_user ON course_exams (user_id, course_id, started_at DESC);

CREATE TABLE course_certificates (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id text NOT NULL,
  holder_name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  score integer NOT NULL,
  total integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
`;
