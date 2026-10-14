/** Article du catalogue d'origine de chaque tâche de chantier, pour analyser les écarts de coût par article. */
export const sql = /* sql */ `
ALTER TABLE job_tasks ADD COLUMN catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL;
CREATE INDEX job_tasks_catalog ON job_tasks (catalog_item_id) WHERE catalog_item_id IS NOT NULL;
`;
