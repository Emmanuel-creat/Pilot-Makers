export const sql = `
ALTER TABLE organizations ADD COLUMN delay_auto_notice boolean NOT NULL DEFAULT false;
CREATE TABLE job_delay_notices (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  new_end date NOT NULL,
  email_id uuid,
  automatic boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, new_end)
);
`;
