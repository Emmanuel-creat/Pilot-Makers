/**
 * Résumé d'un devis en langage simple, pour un particulier qui n'a jamais lu de devis de travaux.
 *
 * Il reprend uniquement ce que dit le devis (aucun montant recalculé autrement que par le devis
 * lui-même) et l'explique en phrases courtes : quoi, combien, quand, et ce que la signature engage.
 */

import { formatEuros } from "@/lib/calc/format";
import { AID_PROGRAMS } from "@/lib/services/aid-rules";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

const frDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** « a », « a et b », « a, b et c » */
export function frenchList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function percentOf(cents: number, percent: string): { percent: string; cents: number } | null {
  const p = Number(percent.replace(",", ".").replace("%", "").trim());
  if (!Number.isFinite(p) || p <= 0 || p > 100) return null;
  return { percent: String(p).replace(".", ","), cents: Math.round((cents * p) / 100) };
}

export function plainSummary(s: QuoteSnapshot): string[] {
  const out: string[] = [];
  const q = s.quote;
  const org = s.org.trade_name || s.org.legal_name;
  const place = q.site.city ? ` à ${q.site.city}` : "";
  out.push(`${org} vous propose de réaliser ces travaux${place} : ${q.title.trim() || "voir le détail ci-dessous"}.`);

  const parts = s.sections.filter((x) => !x.choice || x === s.sections.find((y) => y.choice?.name === x.choice!.name)).map((x) => x.title.trim());
  if (parts.length > 1 && parts.every(Boolean)) out.push(`Le devis est découpé en ${parts.length} parties : ${frenchList(parts)}.`);

  const exempt = s.org.vat_regime === "franchise" || q.reverseCharge === true;
  const ttc = s.calc.totalTtcCents;
  out.push(
    exempt
      ? `Le prix total est de ${formatEuros(ttc)}, sans TVA à ajouter.`
      : `Le prix total est de ${formatEuros(ttc)} TTC, c'est-à-dire TVA comprise : c'est la somme que vous paierez.`,
  );
  const hasChoices = s.sections.some((x) => x.choice) || s.calc.options;
  if (hasChoices) out.push("Certaines parties sont proposées au choix ou en option : le prix final dépend de ce que vous retenez.");

  const deposit = percentOf(ttc, q.depositPercent);
  if (deposit) {
    out.push(
      s.consumer?.withdrawal
        ? `Un acompte de ${deposit.percent} %, soit ${formatEuros(deposit.cents)}, vous sera demandé, au plus tôt sept jours après la signature.`
        : `Un acompte de ${deposit.percent} %, soit ${formatEuros(deposit.cents)}, vous sera demandé à la signature.`,
    );
  }

  const when = [
    q.estimatedStart.trim() ? `début envisagé ${q.estimatedStart.trim()}` : "",
    q.estimatedDuration.trim() ? `durée prévue ${q.estimatedDuration.trim()}` : "",
  ].filter(Boolean);
  if (when.length) out.push(`Calendrier : ${when.join(", ")}.`);

  const estimated = s.sections.flatMap((x) => x.lines).filter((l) => l.kind === "item" && l.estimated).length;
  if (estimated) {
    out.push(
      estimated > 1
        ? `${estimated} lignes sont estimées : leur montant pourra être ajusté après vérification sur place.`
        : "Une ligne est estimée : son montant pourra être ajusté après vérification sur place.",
    );
  }

  if (s.consumer?.withdrawal) out.push("Après avoir signé, vous avez 14 jours pour changer d'avis, sans frais ni justification.");
  if (!exempt && s.consumer?.reducedVatBp.length) {
    out.push("La TVA réduite suppose que le logement est achevé depuis plus de deux ans : en acceptant, vous l'attestez.");
  }
  if (q.energyAid?.programs.length) {
    const names = q.energyAid.programs.map((p) => AID_PROGRAMS[p]);
    out.push(`Ces travaux peuvent vous ouvrir droit à des aides : ${frenchList(names)}.`);
  }
  out.push(`Cette proposition est valable jusqu'au ${frDate(s.validUntil)}. Rien n'est engagé tant que vous ne l'avez pas acceptée.`);
  return out;
}
