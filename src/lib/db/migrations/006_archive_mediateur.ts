/**
 * Archive non modifiable : une version de devis émise et une facture ne peuvent plus
 * être modifiées ni supprimées, même par une requête directe en base. Seule la purge
 * d'un compte supprimé (variable de session pilot.purge) lève cette protection.
 * Médiateur de la consommation de l'entreprise, imprimé sur les devis aux particuliers.
 */
export const sql = /* sql */ `
ALTER TABLE organizations ADD COLUMN mediator_name text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN mediator_url text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION pm_guard_quote_version() RETURNS trigger AS $$ BEGIN IF current_setting('pilot.purge', true) = 'on' THEN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Version de devis archivée : suppression interdite'; END IF; IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.pdf IS DISTINCT FROM OLD.pdf OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256 OR NEW.snapshot_sha256 IS DISTINCT FROM OLD.snapshot_sha256 OR NEW.number IS DISTINCT FROM OLD.number OR NEW.version IS DISTINCT FROM OLD.version OR NEW.total_ht_cents IS DISTINCT FROM OLD.total_ht_cents OR NEW.total_ttc_cents IS DISTINCT FROM OLD.total_ttc_cents OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN RAISE EXCEPTION 'Version de devis archivée : modification interdite'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER quote_versions_archive BEFORE UPDATE OR DELETE ON quote_versions FOR EACH ROW EXECUTE FUNCTION pm_guard_quote_version();
CREATE OR REPLACE FUNCTION pm_guard_invoice() RETURNS trigger AS $$ BEGIN IF current_setting('pilot.purge', true) = 'on' THEN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Facture archivée : suppression interdite'; END IF; IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.pdf IS DISTINCT FROM OLD.pdf OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256 OR NEW.snapshot_sha256 IS DISTINCT FROM OLD.snapshot_sha256 OR NEW.number IS DISTINCT FROM OLD.number OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.total_ht_cents IS DISTINCT FROM OLD.total_ht_cents OR NEW.total_vat_cents IS DISTINCT FROM OLD.total_vat_cents OR NEW.total_ttc_cents IS DISTINCT FROM OLD.total_ttc_cents OR NEW.amount_due_cents IS DISTINCT FROM OLD.amount_due_cents OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN RAISE EXCEPTION 'Facture archivée : modification interdite'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER invoices_archive BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION pm_guard_invoice();
`;
