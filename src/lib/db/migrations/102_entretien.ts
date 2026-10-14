export const sql = `
ALTER TABLE home_record_entries ADD COLUMN equipment_id uuid REFERENCES home_record_entries(id) ON DELETE CASCADE;
CREATE INDEX home_record_entries_equipment ON home_record_entries (equipment_id) WHERE equipment_id IS NOT NULL;
CREATE TABLE maintenance_notices (
  entry_id uuid NOT NULL REFERENCES home_record_entries(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  email_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, due_date)
);
`;
