/** Parc de véhicules et d'outillage : outils suivis et contrôles périodiques (contrôle technique, entretien, vérifications). */
export const sql = /* sql */ `
CREATE TABLE org_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  reference text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_tools_org ON org_tools (org_id);

CREATE TABLE asset_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES org_vehicles(id) ON DELETE CASCADE,
  tool_id uuid REFERENCES org_tools(id) ON DELETE CASCADE,
  label text NOT NULL,
  interval_months integer CHECK (interval_months IS NULL OR interval_months BETWEEN 1 AND 120),
  due_date date,
  last_done date,
  note text NOT NULL DEFAULT '',
  reminded_for date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((vehicle_id IS NULL) <> (tool_id IS NULL))
);
CREATE INDEX asset_checks_org ON asset_checks (org_id, due_date);
`;
