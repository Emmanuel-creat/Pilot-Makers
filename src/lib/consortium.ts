/**
 * Groupement momentané d'entreprises pour répondre ensemble à un gros chantier.
 *
 * Le mandataire porte le devis et répartit ses lots entre les cotraitants. En groupement conjoint,
 * chacun s'engage pour ses lots et est payé directement ; en groupement solidaire, chacun répond
 * de la totalité du marché. La convention reprend la répartition et les règles de fonctionnement.
 */

export const CONSORTIUM_FORMS = { conjoint: "Groupement conjoint", solidaire: "Groupement solidaire" } as const;
export type ConsortiumForm = keyof typeof CONSORTIUM_FORMS;

export const MEMBER_STATUSES = {
  mandataire: "Mandataire",
  invite: "Invitation envoyée",
  accepte: "Participation acceptée",
  refuse: "Participation refusée",
  externe: "Entreprise hors application",
} as const;
export type MemberStatus = keyof typeof MEMBER_STATUSES;

export interface SectionTotal {
  id: string;
  title: string;
  subtotalCents: number;
}

export interface MemberLots {
  id: string;
  name: string;
  status: MemberStatus;
  sectionIds: string[];
}

/**
 * Montant hors taxe de chaque membre : la somme de ses lots, remise globale répartie au prorata.
 * Le dernier membre servi absorbe l'arrondi pour que la somme tombe juste.
 */
export function allocate(sections: SectionTotal[], members: MemberLots[], totalHtCents: number) {
  const subtotal = sections.reduce((s, x) => s + x.subtotalCents, 0);
  const owner = new Map<string, string>();
  for (const m of members) for (const id of m.sectionIds) if (!owner.has(id)) owner.set(id, m.id);
  const active = members.filter((m) => m.status !== "refuse");
  let given = 0;
  const shares = active.map((m, i) => {
    const raw = sections.filter((s) => owner.get(s.id) === m.id).reduce((s, x) => s + x.subtotalCents, 0);
    const assignedAll = sections.every((s) => owner.has(s.id));
    const last = i === active.length - 1 && assignedAll;
    const amount = last ? totalHtCents - given : subtotal ? Math.round((raw * totalHtCents) / subtotal) : 0;
    given += amount;
    return {
      memberId: m.id,
      name: m.name,
      lots: sections.filter((s) => owner.get(s.id) === m.id).map((s) => s.title || "Lot sans titre"),
      amountCents: amount,
    };
  });
  return shares.map((s) => ({ ...s, shareBp: totalHtCents ? Math.round((s.amountCents * 10000) / totalHtCents) : 0 }));
}

/** Points à régler avant de déposer l'offre du groupement. */
export function consortiumIssues(sections: SectionTotal[], members: MemberLots[]): string[] {
  const issues: string[] = [];
  const assigned = new Set(members.filter((m) => m.status !== "refuse").flatMap((m) => m.sectionIds));
  const free = sections.filter((s) => !assigned.has(s.id));
  if (free.length) issues.push(`Lots sans entreprise : ${free.map((s) => s.title || "lot sans titre").join(", ")}`);
  if (members.filter((m) => m.status !== "refuse").length < 2) issues.push("Un groupement réunit au moins deux entreprises");
  for (const m of members) {
    if (m.status === "invite") issues.push(`${m.name} n'a pas encore accepté sa participation`);
    if (m.status !== "refuse" && m.status !== "mandataire" && !m.sectionIds.length) issues.push(`${m.name} n'a aucun lot`);
    if (m.status === "refuse" && m.sectionIds.length) issues.push(`${m.name} a refusé : ses lots sont à réattribuer`);
  }
  return issues;
}

/** Articles de la convention de groupement. */
export function conventionClauses(form: ConsortiumForm, mandataireSolidaire: boolean, mandataire: string, project: string): string[] {
  return [
    `Objet : les entreprises soussignées se constituent en ${CONSORTIUM_FORMS[form].toLowerCase()} pour l'exécution des travaux « ${project} », selon la répartition des lots ci-dessus.`,
    `Mandataire : ${mandataire} représente l'ensemble des membres auprès du maître d'ouvrage, coordonne les prestations, organise les réunions de chantier et transmet les documents du marché.`,
    form === "solidaire"
      ? "Engagement : chaque membre est engagé financièrement pour la totalité du marché et doit pallier une éventuelle défaillance de ses partenaires."
      : mandataireSolidaire
        ? "Engagement : chaque membre est engagé pour les seuls lots qui lui sont attribués ; le mandataire est en outre solidaire de chacun des membres pour ses obligations contractuelles."
        : "Engagement : chaque membre est engagé pour les seuls lots qui lui sont attribués.",
    form === "solidaire"
      ? "Paiement : les sommes dues sont versées sur un compte unique indiqué par le mandataire, qui les répartit selon la part de chaque membre."
      : "Paiement : chaque membre facture ses propres lots et est payé directement sur son compte.",
    "Frais communs : les dépenses communes (installation de chantier, compte prorata, coordination) sont réparties au prorata du montant de chaque membre.",
    "Assurances : chaque membre conserve ses propres assurances de responsabilité civile et décennale pour les travaux qu'il exécute.",
    "Durée : la convention prend effet à sa signature et prend fin à l'expiration de la garantie de parfait achèvement, sauf litige en cours.",
  ];
}
