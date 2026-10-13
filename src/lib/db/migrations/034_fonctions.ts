/** Droits par fonction : gérant, conducteur de travaux, secrétariat, ouvrier. */
export const sql = /* sql */ `
ALTER TABLE memberships ADD COLUMN job_function text CHECK (job_function IN ('gerant', 'conducteur', 'secretariat', 'ouvrier'));
`;
