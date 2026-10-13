/** Suivi du recouvrement d'une facture : date d'envoi de la mise en demeure. */
export const sql = /* sql */ `
ALTER TABLE invoices ADD COLUMN formal_notice_on date;
ALTER TABLE invoices ADD COLUMN formal_notice_ref text NOT NULL DEFAULT '';
`;
