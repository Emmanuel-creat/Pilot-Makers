/** Campagnes e-mail vers les anciens clients, avec désinscription. */
export const sql = /* sql */ `
ALTER TABLE customers ADD COLUMN marketing_optout_at timestamptz;
ALTER TABLE customers ADD COLUMN marketing_token text UNIQUE;
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'envoyee')),
  recipients integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE campaign_recipients (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  PRIMARY KEY (campaign_id, customer_id)
);
`;
