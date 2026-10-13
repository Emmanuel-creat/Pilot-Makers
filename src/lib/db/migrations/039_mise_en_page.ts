/** Mises en page du PDF de devis : détaillée, récapitulatif en tête, un lot par page. */
export const sql = /* sql */ `
ALTER TABLE quotes ADD COLUMN pdf_layout text NOT NULL DEFAULT 'detaille' CHECK (pdf_layout IN ('detaille', 'synthese', 'lots'));
`;
