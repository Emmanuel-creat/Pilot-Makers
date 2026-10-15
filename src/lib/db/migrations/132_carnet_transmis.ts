/** Carnets transmis d'un artisan à l'autre : chaque entrée reprise garde l'entreprise qui l'a écrite. */
export const sql = /* sql */ `
ALTER TABLE home_record_entries ADD COLUMN source_name text NOT NULL DEFAULT '';
ALTER TABLE home_record_entries ADD COLUMN source_entry_id uuid;
CREATE UNIQUE INDEX home_record_entries_source ON home_record_entries (record_id, source_entry_id) WHERE source_entry_id IS NOT NULL;
`;
