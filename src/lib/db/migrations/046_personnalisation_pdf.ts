/** Personnalisation du PDF : police, mise en page par défaut des nouveaux devis et mention libre en pied de page. */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN pdf_font text NOT NULL DEFAULT 'helvetica' CHECK (pdf_font IN ('helvetica','times'));
ALTER TABLE organizations ADD COLUMN default_pdf_layout text NOT NULL DEFAULT 'detaille' CHECK (default_pdf_layout IN ('detaille','synthese','lots'));
ALTER TABLE organizations ADD COLUMN pdf_footer_note text NOT NULL DEFAULT '';
`;
