/** Dossier de demande de financement d'équipement, à joindre à l'envoi à la banque ou au loueur. */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatEuros } from "@/lib/calc/format";
import { EQUIPMENT_CATEGORIES, FINANCING_KINDS } from "@/lib/financing";
import type { FinancingDossier } from "@/lib/services/financing";
import { fr, GREY, Page } from "./reception-pdf";

const rate = (bp: number) => `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export async function renderFinancingPdf(d: FinancingDossier): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = d.request;
  doc.setTitle(`Demande de financement : ${f.label}`);
  doc.setProducer("Pilot-Makers");
  doc.setCreator("Pilot-Makers");
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  p.title("DEMANDE DE FINANCEMENT D'ÉQUIPEMENT", `${d.org.name}. Établie le ${fr(d.today)}.`);

  p.heading("Entreprise");
  p.field("Raison sociale", d.org.name);
  p.field("Forme juridique", d.org.legalForm);
  p.field("SIRET", d.org.siret);
  p.field("Activité", d.org.trade);
  p.field("Adresse", d.org.address);
  p.field("Contact", d.org.contact);
  p.field("Assureur", d.org.insurer);

  p.heading("Chiffre d'affaires facturé (HT)");
  if (d.years.length) for (const y of d.years) p.field(String(y.year), formatEuros(y.htCents));
  else p.line("Pas encore d'exercice complet facturé dans le logiciel.", 10, p.regular, GREY);
  p.field("12 derniers mois", formatEuros(d.last12Cents));

  p.heading("Équipement à financer");
  p.field("Équipement", f.label);
  p.field("Catégorie", EQUIPMENT_CATEGORIES[f.category]);
  p.field("Fournisseur", f.supplier);
  p.field("Devis fournisseur", f.quoteRef);
  p.field("Montant HT", formatEuros(f.amountCents));
  p.field("Apport", formatEuros(f.downCents));
  if (f.purpose) p.field("Usage prévu", f.purpose);

  p.heading("Financement souhaité");
  p.field("Formule", FINANCING_KINDS[f.kind]);
  p.field("Durée", `${f.months} mois`);
  p.field("Taux indicatif", rate(f.rateBp));
  if (f.residualBp) p.field("Valeur résiduelle", `${rate(f.residualBp)}, soit ${formatEuros(Math.round((f.amountCents * f.residualBp) / 10_000))}`);
  p.field("Mensualité estimée HT", formatEuros(d.chosen.monthlyCents));
  p.field("Coût estimé du financement", formatEuros(d.chosen.costCents));
  if (d.burdenPct !== null) p.field("Poids dans le CA mensuel", `${d.burdenPct.toLocaleString("fr-FR")} %`);

  p.heading("Autres durées simulées");
  for (const s of d.simulations) p.field(`${s.months} mois`, `${formatEuros(s.monthlyCents)} par mois, coût ${formatEuros(s.costCents)}`);

  p.gap(10);
  p.line(
    "Simulation indicative établie par l'entreprise à partir d'un taux estimé ; elle ne vaut pas offre. Les conditions définitives sont celles proposées par le financeur.",
    8,
    p.regular,
    GREY,
  );
  return doc.save();
}
