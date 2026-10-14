/** Parrainage entre clients : code personnel du client parrain, demandes parrainées et récompense versée. */
export const sql = /* sql */ `
ALTER TABLE customers ADD COLUMN referral_code text;
CREATE UNIQUE INDEX customers_referral_code ON customers (org_id, referral_code) WHERE referral_code IS NOT NULL;
ALTER TABLE leads ADD COLUMN referrer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN referral_rewarded_at timestamptz;
CREATE INDEX leads_referrer ON leads (referrer_id) WHERE referrer_id IS NOT NULL;
ALTER TABLE organizations ADD COLUMN referral jsonb NOT NULL DEFAULT '{}';
`;
