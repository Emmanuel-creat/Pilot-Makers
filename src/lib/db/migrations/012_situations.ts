/** Factures de situation : facturation à l'avancement des travaux. */
export const sql = /* sql */ `
ALTER TABLE invoices DROP CONSTRAINT invoices_kind_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('deposit','final','credit_note','progress'));
`;
