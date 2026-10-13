/** Coûts de chantier : coût prévu par tâche (repris du devis), achats affectés, seuil d'alerte de budget. */
export const sql = /* sql */ `
ALTER TABLE job_tasks ADD COLUMN nature text NOT NULL DEFAULT '';
ALTER TABLE job_tasks ADD COLUMN cost_cents bigint;
ALTER TABLE jobs ADD COLUMN budget_alert_bp integer NOT NULL DEFAULT 9000 CHECK (budget_alert_bp BETWEEN 5000 AND 15000);
CREATE TABLE job_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES job_tasks(id) ON DELETE SET NULL,
  purchase_date date NOT NULL,
  supplier text NOT NULL DEFAULT '',
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('materiau', 'sous_traitance', 'location', 'autre')),
  amount_ht_cents bigint NOT NULL,
  reference text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_purchases_job ON job_purchases (job_id, purchase_date);
`;
