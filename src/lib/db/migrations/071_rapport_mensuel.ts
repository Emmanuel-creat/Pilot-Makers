/** Rapport mensuel envoyé au gérant : activation et dernier mois envoyé. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN monthly_report_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN monthly_report_sent text NOT NULL DEFAULT '';
`;
