/**
 * Journal scellé des actions d'administration (chaîne d'empreintes, ni modification ni suppression)
 * et incidents affichés sur la page de statut publique.
 */
export const sql = /* sql */ `
CREATE TABLE admin_journal (
  seq bigint PRIMARY KEY,
  payload text NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION pm_guard_admin_journal() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Journal scellé : modification ou suppression interdite'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER admin_journal_guard BEFORE UPDATE OR DELETE ON admin_journal FOR EACH ROW EXECUTE FUNCTION pm_guard_admin_journal();
CREATE TRIGGER admin_journal_guard_truncate BEFORE TRUNCATE ON admin_journal FOR EACH STATEMENT EXECUTE FUNCTION pm_guard_admin_journal();

CREATE TABLE status_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'perturbation' CHECK (severity IN ('maintenance', 'perturbation', 'panne')),
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX status_incidents_started ON status_incidents (started_at DESC);
`;
