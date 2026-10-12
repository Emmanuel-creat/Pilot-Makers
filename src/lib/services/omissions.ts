/**
 * Oublis fréquents d'un devis de travaux : de simples rappels, jamais bloquants.
 * Ils ne se déclenchent que sur un devis assez fourni pour qu'un oubli soit probable.
 */

export interface OmissionLine {
  kind: string;
  nature: string;
  label: string;
}

export interface Omission {
  code: "protection" | "gravats" | "nettoyage" | "deplacement";
  message: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function frequentOmissions(lines: OmissionLine[], opts: { travelFee?: string } = {}): Omission[] {
  const items = lines.filter((l) => l.kind === "item" || l.kind === "pending");
  if (items.length < 3) return [];
  const labels = lines.map((l) => norm(l.label));
  const has = (re: RegExp) => labels.some((l) => re.test(l));
  const out: Omission[] = [];
  const removal = has(/\b(depose|demoli|arrach|decoll|piquage|casse)/);
  const finishing = has(/\b(pose|peinture|enduit|ponc|carrel|parquet|faience|platr)/);
  if ((removal || finishing) && !has(/protect|bache|film|calfeutr/)) {
    out.push({ code: "protection", message: "Rappel : aucune ligne de protection des sols et des meubles. Est-elle comprise ailleurs ?" });
  }
  if (removal && !has(/gravat|evacu|benne|dechet|decheter|big ?bag/)) {
    out.push({ code: "gravats", message: "Rappel : des déposes sont prévues mais pas l'évacuation des gravats." });
  }
  if (!has(/nettoy|menage/)) {
    out.push({ code: "nettoyage", message: "Rappel : aucun nettoyage de fin de chantier n'est prévu." });
  }
  if (!items.some((l) => l.nature === "deplacement") && !has(/deplacement|trajet|kilomet/) && !(opts.travelFee ?? "").trim()) {
    out.push({ code: "deplacement", message: "Rappel : aucun frais de déplacement, ni dans les lignes ni dans le profil de l'entreprise." });
  }
  return out;
}
