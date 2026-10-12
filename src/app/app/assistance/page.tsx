import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { Icon } from "@/components/Icon";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listReleases, listTickets } from "@/lib/services/admin";
import { ticketAction } from "@/app/actions";

export const metadata = { title: "Assistance" };

const FAQ = [
  ["Comment modifier un devis déjà envoyé ?", "Ouvrez le devis puis « Modifier (nouvelle version) ». La version envoyée reste conservée telle quelle ; le client reçoit la nouvelle version quand vous l'émettez et l'envoyez."],
  ["Le client n'a pas reçu l'e-mail.", "Vérifiez l'adresse dans « E-mails envoyés ». Vous pouvez aussi créer un lien de consultation depuis la fiche du devis et le transmettre par SMS."],
  ["Comment choisir le taux de TVA ?", "Le logiciel ne choisit jamais le taux à votre place. Les taux réduits dépendent de la nature des travaux et du logement. Quand un taux réduit est présent, l'attestation du client figure sur le devis et il la coche en acceptant en ligne."],
  ["Mes données sont-elles exportables ?", "Oui, à tout moment depuis « Mon compte », y compris si votre abonnement est arrêté."],
  ["L'acceptation en ligne vaut-elle signature ?", "Elle constitue un accord daté et tracé (nom, date, adresse IP, empreinte du document), mais pas une signature électronique qualifiée."],
];

export default async function SupportPage() {
  const ctx = await requirePageCtx();
  const [tickets, releases] = await Promise.all([listTickets(ctx), listReleases(ctx.db)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Assistance"
        actions={
          <Link href="/aide" className="btn-secondary">
            <Icon name="help" size={16} /> Centre d'aide
          </Link>
        }
      />
      <Section title="Questions fréquentes">
        <div className="divide-y divide-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="py-3 text-sm">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-2 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>
      <Section title="Nous écrire">
        <ActionForm action={ticketAction} resetOnSuccess>
          <div>
            <label className="label" htmlFor="t-subject">
              Sujet
            </label>
            <input id="t-subject" name="subject" className="field" required minLength={3} />
          </div>
          <div>
            <label className="label" htmlFor="t-body">
              Message
            </label>
            <textarea id="t-body" name="body" rows={4} className="field" required minLength={10} />
          </div>
          <div className="flex justify-end">
            <Submit>Envoyer</Submit>
          </div>
        </ActionForm>
      </Section>
      {tickets.length ? (
        <Section title="Mes demandes">
          <ul className="divide-y divide-line text-sm">
            {tickets.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{t.subject}</span>
                  <span className="text-xs text-muted">{t.status === "open" ? "En attente" : t.status === "answered" ? "Répondu" : "Clos"}</span>
                </div>
                <p className="text-xs text-muted">{fmtDate(t.created_at, true)}</p>
                {t.answer ? <p className="mt-2 rounded-md bg-accent-soft p-3">{t.answer}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {releases.length ? (
        <Section title="Nouveautés">
          <ul className="space-y-3 text-sm">
            {releases.map((r) => (
              <li key={r.id}>
                <div className="font-medium">
                  Version {r.version} <span className="font-normal text-muted">du {fmtDate(r.created_at)}</span>
                </div>
                <p className="whitespace-pre-line text-muted">{r.notes}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
