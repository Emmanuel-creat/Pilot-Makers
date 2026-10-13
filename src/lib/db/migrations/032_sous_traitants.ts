/** Sous-traitants : fiche, documents obligatoires (attestation de vigilance, assurance décennale) et affectation aux chantiers. */
export const sql = /* sql */ `
CREATE TABLE subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  siret text NOT NULL DEFAULT '',
  trade text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  auto_remind boolean NOT NULL DEFAULT false,
  last_reminder_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subcontractors_org ON subcontractors (org_id, name);

CREATE TABLE subcontractor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('urssaf', 'decennale', 'rc_pro', 'kbis', 'contrat', 'autre')),
  label text NOT NULL DEFAULT '',
  valid_until date,
  file bytea,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_sha256 text NOT NULL DEFAULT '',
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subcontractor_documents_sub ON subcontractor_documents (subcontractor_id, kind, valid_until);

CREATE TABLE job_subcontractors (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT '',
  amount_ht_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, subcontractor_id)
);
`;
