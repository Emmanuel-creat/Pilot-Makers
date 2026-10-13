/** Bons de commande fournisseurs depuis le devis signé, réception des marchandises et rapprochement des factures. */
export const sql = /* sql */ `
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier text NOT NULL DEFAULT '',
  supplier_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'envoye', 'recu_partiel', 'recu', 'annule')),
  delivery_date date,
  delivery_address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  sent_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX purchase_orders_job ON purchase_orders (job_id);
CREATE TABLE purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  task_id uuid REFERENCES job_tasks(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  reference text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'u',
  quantity_milli bigint NOT NULL CHECK (quantity_milli > 0),
  unit_cost_cents bigint NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  received_milli bigint NOT NULL DEFAULT 0 CHECK (received_milli >= 0)
);
CREATE INDEX purchase_order_lines_order ON purchase_order_lines (order_id, position);
ALTER TABLE job_purchases ADD COLUMN purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;
`;
