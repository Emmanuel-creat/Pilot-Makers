/** Avis des clients recueillis après chantier, publiés sur la page vitrine. */
export const sql = /* sql */ `
CREATE TABLE customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  author_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  work_date date,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  publish_consent boolean NOT NULL DEFAULT false,
  requested_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  hidden_reason text NOT NULL DEFAULT '',
  reply text NOT NULL DEFAULT '',
  UNIQUE (job_id)
);
CREATE INDEX customer_reviews_org ON customer_reviews(org_id, submitted_at DESC);
`;
