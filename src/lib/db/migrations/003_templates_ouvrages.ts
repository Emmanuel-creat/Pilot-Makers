export const sql = /* sql */ `
CREATE TABLE quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  data jsonb NOT NULL,
  line_count integer NOT NULL DEFAULT 0,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
ALTER TABLE catalog_items ADD COLUMN kind text NOT NULL DEFAULT 'simple' CHECK (kind IN ('simple','ouvrage'));
ALTER TABLE catalog_items ADD COLUMN composition_text text NOT NULL DEFAULT '';
CREATE TABLE catalog_components (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  position integer NOT NULL,
  quantity text NOT NULL,
  PRIMARY KEY (parent_id, child_id)
);
CREATE INDEX catalog_components_child ON catalog_components (child_id);
`;
