/** Étapes du dossier d'aide suivies dans le parcours de rénovation énergétique */
export const sql = /* sql */ `
ALTER TABLE energy_diagnoses ADD COLUMN aid_steps jsonb NOT NULL DEFAULT '{}'::jsonb;
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
ALTER TABLE energy_diagnoses DROP COLUMN aid_steps;
`;
