export const sql = `
CREATE TABLE public_tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('dpgf', 'bpu')),
  rows jsonb NOT NULL,
  columns jsonb NOT NULL,
  line_map jsonb NOT NULL,
  matched integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_tenders_quote ON public_tenders (quote_id);
`;
