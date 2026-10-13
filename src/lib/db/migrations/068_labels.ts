/** Labels de l'entreprise (hors qualifications RGE), montrés sur la vitrine et les devis en ligne. */
export const sql = /* sql */ `
CREATE TABLE org_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL DEFAULT '',
  number text NOT NULL DEFAULT '',
  valid_until date,
  shown boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_labels_org ON org_labels(org_id);
`;
