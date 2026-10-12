/** Échéanciers de paiement en plusieurs fois, ajoutés à une facture émise. */
export const sql = /* sql */ `
ALTER TABLE invoices ADD COLUMN schedule jsonb;
`;
