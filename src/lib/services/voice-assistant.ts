/**
 * Assistant vocal : prépare l'action demandée, la fait relire, puis l'exécute après confirmation.
 *
 * Deux étapes séparées : `prepareVoice` comprend la phrase et cherche ce qu'elle désigne (client,
 * facture) sans rien modifier ; `executeVoice` fait l'action relue et éventuellement corrigée, avec
 * les mêmes contrôles de droits que l'écran correspondant.
 */

import { formatEuros } from "@/lib/calc/format";
import { searchHelp } from "@/lib/help";
import { badRequest } from "@/lib/http";
import { fold, parseCommand, type VoiceIntent } from "@/lib/voice-commands";
import type { Ctx } from "./context";
import { audit } from "./context";
import { createCustomer, customerDisplayName, searchCustomers } from "./customers";
import { addExpense, EXPENSE_CATEGORIES } from "./expenses";
import { invoiceSummary, listInvoices, PAYMENT_METHODS, recordPayment } from "./invoices";
import { planning } from "./planning";
import { createQuote, parisDate } from "./quotes";

export interface VoiceField {
  name: string;
  label: string;
  value: string;
  options?: { value: string; label: string }[];
  type?: "text" | "date";
}

export type VoicePlan =
  | { kind: "go"; say: string; href: string }
  | { kind: "answer"; say: string; href?: string; linkLabel?: string }
  | { kind: "confirm"; action: "customer" | "quote" | "expense" | "payment"; title: string; say: string; fields: VoiceField[] };

const options = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

/** Client désigné par les premiers mots de la phrase ; le reste sert d'objet du devis. */
async function customerFromStart(ctx: Ctx, words: string) {
  const list = words.split(/\s+/).filter(Boolean);
  for (let n = Math.min(4, list.length); n >= 1; n--) {
    const name = list.slice(0, n).join(" ");
    const found = await searchCustomers(ctx, { q: name, limit: 5 });
    const exact = found.filter((c) => {
      const label = fold(customerDisplayName(c));
      const key = fold(name);
      return label === key || label.split(" ").includes(key) || fold(`${c.last_name} ${c.first_name}`) === key;
    });
    const pick = exact.length ? exact : n >= 2 ? found : [];
    if (pick.length) return { matches: pick.slice(0, 5), rest: list.slice(n).join(" ") };
  }
  return { matches: [], rest: words };
}

const normRef = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

export async function prepareVoice(ctx: Ctx, text: string, now = new Date()): Promise<VoicePlan> {
  const said = text.trim().slice(0, 500);
  if (!said) throw badRequest("Dites ou écrivez votre demande");
  const intent: VoiceIntent = parseCommand(said);
  const today = parisDate(now);

  switch (intent.kind) {
    case "navigate":
      return { kind: "go", say: `J'ouvre ${intent.label}.`, href: intent.href };

    case "search":
      return { kind: "go", say: `Je cherche « ${intent.query} ».`, href: `/app/recherche?q=${encodeURIComponent(intent.query)}` };

    case "create_customer": {
      const name = intent.company || [intent.firstName, intent.lastName].filter(Boolean).join(" ");
      return {
        kind: "confirm",
        action: "customer",
        title: "Nouveau client",
        say: name ? `Je crée le client ${name}. Vérifiez puis confirmez.` : "Je crée un client. Complétez son nom puis confirmez.",
        fields: [
          { name: "firstName", label: "Prénom", value: intent.firstName },
          { name: "lastName", label: "Nom", value: intent.lastName },
          { name: "company", label: "Société", value: intent.company },
          { name: "phone", label: "Téléphone", value: intent.phone },
          { name: "email", label: "E-mail", value: intent.email },
          { name: "city", label: "Ville", value: intent.city },
        ],
      };
    }

    case "create_quote": {
      const { matches, rest } = intent.words ? await customerFromStart(ctx, intent.words) : { matches: [], rest: "" };
      const title = rest.replace(/^(?:pour|de|d'|concernant|objet)\s+/i, "").trim();
      return {
        kind: "confirm",
        action: "quote",
        title: "Nouveau devis",
        say: matches.length
          ? `Je crée un devis pour ${customerDisplayName(matches[0])}${title ? `, objet « ${title} »` : ""}.`
          : intent.words
            ? `Je n'ai pas trouvé de client « ${intent.words} » : choisissez-le ou laissez le devis sans client.`
            : "Je crée un devis vierge.",
        fields: [
          {
            name: "customerId",
            label: "Client",
            value: matches[0]?.id ?? "",
            options: [...matches.map((c) => ({ value: c.id, label: `${customerDisplayName(c)}${c.billing_city ? `, ${c.billing_city}` : ""}` })), { value: "", label: "Sans client pour l'instant" }],
          },
          { name: "title", label: "Objet du devis", value: title.replace(/^\p{Ll}/u, (c) => c.toUpperCase()).slice(0, 200) },
        ],
      };
    }

    case "expense":
      return {
        kind: "confirm",
        action: "expense",
        title: "Note de frais",
        say: intent.amount ? `Je note une dépense de ${intent.amount} euros. Ajoutez la TVA si elle figure sur le ticket.` : "Je prépare une note de frais : indiquez le montant.",
        fields: [
          { name: "amount", label: "Montant TTC (euros)", value: intent.amount },
          { name: "vat", label: "Dont TVA", value: "" },
          { name: "category", label: "Catégorie", value: intent.category, options: options(EXPENSE_CATEGORIES) },
          { name: "merchant", label: "Commerçant", value: intent.merchant },
          { name: "date", label: "Date", value: today, type: "date" },
          { name: "payment", label: "Payé avec", value: intent.payment, options: options({ perso: "Mes fonds personnels", entreprise: "La carte de l'entreprise" }) },
        ],
      };

    case "payment": {
      const open = (await listInvoices(ctx, { limit: 500 })).filter((i) => i.kind !== "credit_note" && Number(i.balance_cents) > 0);
      let found = open;
      if (intent.invoiceRef) {
        const ref = normRef(intent.invoiceRef);
        found = open.filter((i) => normRef(i.number) === ref || normRef(i.number).endsWith(ref));
      } else if (intent.customer) {
        const key = fold(intent.customer);
        found = open.filter((i) => fold(i.customer_name ?? "").split(/\s+/).includes(key) || fold(i.customer_name ?? "").includes(key));
      } else found = [];
      if (!found.length) {
        return {
          kind: "answer",
          say: intent.invoiceRef
            ? `Je ne trouve pas de facture à encaisser portant le numéro ${intent.invoiceRef}.`
            : intent.customer
              ? `Je ne trouve pas de facture à encaisser pour ${intent.customer}.`
              : "Précisez le numéro de la facture ou le nom du client.",
          href: "/app/factures?statut=issued",
          linkLabel: "Voir les factures à encaisser",
        };
      }
      const first = found[0];
      return {
        kind: "confirm",
        action: "payment",
        title: "Paiement reçu",
        say: `J'enregistre le paiement de la facture ${first.number} de ${first.customer_name}, reste à payer ${formatEuros(Number(first.balance_cents))}.`,
        fields: [
          {
            name: "invoiceId",
            label: "Facture",
            value: first.id,
            options: found.slice(0, 10).map((i) => ({ value: i.id, label: `${i.number}, ${i.customer_name}, reste ${formatEuros(Number(i.balance_cents))}` })),
          },
          { name: "amount", label: "Montant reçu (euros)", value: intent.amount || (Number(first.balance_cents) / 100).toFixed(2).replace(".", ",") },
          { name: "method", label: "Moyen de paiement", value: intent.method, options: options(PAYMENT_METHODS) },
          { name: "paidOn", label: "Date de réception", value: today, type: "date" },
        ],
      };
    }

    case "question": {
      if (intent.topic === "overdue") {
        const late = await listInvoices(ctx, { status: "overdue", limit: 200 });
        const total = late.reduce((s, i) => s + Math.max(Number(i.balance_cents), 0), 0);
        return {
          kind: "answer",
          say: late.length
            ? `${late.length} facture${late.length > 1 ? "s" : ""} en retard, pour ${formatEuros(total)} : ${late
                .slice(0, 3)
                .map((i) => `${i.number} de ${i.customer_name}`)
                .join(", ")}${late.length > 3 ? ", et d'autres" : ""}.`
            : "Aucune facture en retard.",
          href: "/app/factures?statut=overdue",
          linkLabel: "Voir les factures en retard",
        };
      }
      if (intent.topic === "to_collect") {
        const s = await invoiceSummary(ctx);
        return {
          kind: "answer",
          say: `Il reste ${formatEuros(s.toCollectCents)} à encaisser sur ${s.openCount} facture${s.openCount > 1 ? "s" : ""}, dont ${formatEuros(s.overdueCents)} en retard.`,
          href: "/app/factures?statut=issued",
          linkLabel: "Voir les factures à encaisser",
        };
      }
      if (intent.topic === "pending_quotes") {
        const rows = await ctx.db.query<{ n: number; total: unknown }>(
          "SELECT count(*)::int AS n, coalesce(sum(total_ttc_cents), 0) AS total FROM quotes WHERE org_id=$1 AND archived_at IS NULL AND status IN ('sent', 'viewed')",
          [ctx.orgId],
        );
        const n = rows[0]?.n ?? 0;
        return {
          kind: "answer",
          say: n ? `${n} devis attendent la réponse du client, pour ${formatEuros(Number(rows[0].total))} TTC.` : "Aucun devis en attente de réponse.",
          href: "/app/devis",
          linkLabel: "Voir les devis",
        };
      }
      const slots = await planning(ctx, today, today);
      return {
        kind: "answer",
        say: slots.length
          ? `Aujourd'hui : ${[...new Set(slots.map((s) => `${s.title}${s.city ? ` à ${s.city}` : ""}`))].slice(0, 5).join(", ")}.`
          : "Rien n'est prévu au planning aujourd'hui.",
        href: "/app/planning",
        linkLabel: "Ouvrir le planning",
      };
    }

    case "help": {
      const article = searchHelp(said)[0];
      if (article && searchHelp(said).length < 40) {
        return {
          kind: "answer",
          say: `${article.summary} ${article.steps[0] ?? ""}`.trim(),
          href: `/aide/${article.slug}`,
          linkLabel: `Lire : ${article.title}`,
        };
      }
      return {
        kind: "answer",
        say: "Je n'ai pas compris. Essayez par exemple : « Crée un devis pour Durand salle de bain », « Note de frais de 23 euros pour un repas », « La facture F-2026-0012 est payée », « Quelles factures sont en retard ? » ou « Ouvre le planning ».",
      };
    }
  }
}

const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");

/** Exécution après relecture et confirmation. */
export async function executeVoice(ctx: Ctx, action: string, raw: unknown): Promise<{ say: string; href: string }> {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let out: { say: string; href: string };
  if (action === "customer") {
    const company = str(v, "company");
    const r = await createCustomer(ctx, {
      type: company ? "entreprise" : "particulier",
      first_name: str(v, "firstName"),
      last_name: str(v, "lastName"),
      company_name: company,
      phone: str(v, "phone"),
      email: str(v, "email"),
      billing_city: str(v, "city"),
    });
    if (!r.id) {
      const d = r.duplicates[0];
      return { say: `Ce client existe déjà : ${d.name}. Je vous ouvre sa fiche.`, href: `/app/clients/${d.id}` };
    }
    out = { say: "Client créé.", href: `/app/clients/${r.id}` };
  } else if (action === "quote") {
    const id = await createQuote(ctx, { customerId: str(v, "customerId") || null, title: str(v, "title").slice(0, 200) });
    out = { say: "Devis créé : ajoutez les lignes.", href: `/app/devis/${id}` };
  } else if (action === "expense") {
    await addExpense(ctx, {
      date: str(v, "date"),
      merchant: str(v, "merchant"),
      category: str(v, "category"),
      amount: str(v, "amount"),
      vat: str(v, "vat"),
      payment: str(v, "payment") || "perso",
    });
    out = { say: "Note de frais envoyée pour validation.", href: "/app/frais" };
  } else if (action === "payment") {
    const invoiceId = str(v, "invoiceId");
    await recordPayment(ctx, invoiceId, { amount: str(v, "amount"), paidOn: str(v, "paidOn"), method: str(v, "method"), reference: "Saisi à la voix" });
    out = { say: "Paiement enregistré.", href: `/app/factures/${invoiceId}` };
  } else throw badRequest("Action inconnue");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "assistant.voice_action", data: { action }, ip: ctx.ip });
  return out;
}
