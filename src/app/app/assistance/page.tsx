import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { Icon } from "@/components/Icon";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listTickets } from "@/lib/services/admin";
import { callbackAction, cancelCallbackAction, sessionRegistrationAction, ticketAction } from "@/app/actions";
import { CALLBACK_SLOTS, CALLBACK_STATUSES, callbackDays, myCallbacks, supportPhone, upcomingSessions } from "@/lib/services/support-desk";

export const metadata = { title: "Assistance" };

const FAQ = [
  [
    "Comment modifier un devis déjà envoyé ?",
    "Ouvrez le devis puis « Modifier (nouvelle version) ». La version envoyée reste conservée telle quelle ; le client reçoit la nouvelle version quand vous l'émettez et l'envoyez.",
  ],
  [
    "Le client n'a pas reçu l'e-mail.",
    "Vérifiez l'adresse dans « E-mails envoyés ». Vous pouvez aussi créer un lien de consultation depuis la fiche du devis et le transmettre par SMS.",
  ],
  [
    "Comment choisir le taux de TVA ?",
    "Le logiciel ne choisit jamais le taux à votre place. Les taux réduits dépendent de la nature des travaux et du logement. Quand un taux réduit est présent, l'attestation du client figure sur le devis et il la coche en acceptant en ligne.",
  ],
  ["Mes données sont-elles exportables ?", "Oui, à tout moment depuis « Mon compte », y compris si votre abonnement est arrêté."],
  [
    "L'acceptation en ligne vaut-elle signature ?",
    "Elle constitue un accord daté et tracé (nom, date, adresse IP, empreinte du document), mais pas une signature électronique qualifiée.",
  ],
];

export default async function SupportPage() {
  const ctx = await requirePageCtx();
  const [tickets, callbacks, sessions] = await Promise.all([listTickets(ctx), myCallbacks(ctx), upcomingSessions(ctx)]);
  const phone = supportPhone();
  const pending = callbacks.find((c) => c.status === "demande");
  const dayLabel = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
  const when = (d: Date) =>
    new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
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
      <Section title="Parler à un conseiller">
        {phone ? (
          <p className="mb-3 text-sm">
            Appelez-nous au{" "}
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="link font-medium tabular">
              {phone}
            </a>
            , du lundi au vendredi de 9 h à 12 h et de 14 h à 17 h, ou demandez à être rappelé.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">Choisissez un créneau : un conseiller vous rappelle, du lundi au vendredi.</p>
        )}
        {pending ? (
          <div className="rounded-md bg-accent-soft p-3 text-sm" data-testid="rappel-prevu">
            <p>
              <Icon name="phone" size={16} className="mr-1 inline" /> Rappel prévu le {dayLabel(pending.wished_on)},{" "}
              {CALLBACK_SLOTS[pending.slot].toLowerCase()}, au <span className="tabular">{pending.phone}</span>.
            </p>
            <ActionForm action={cancelCallbackAction} className="mt-2">
              <input type="hidden" name="id" value={pending.id} />
              <Submit className="btn-ghost min-h-9">Annuler le rappel</Submit>
            </ActionForm>
          </div>
        ) : (
          <ActionForm action={callbackAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cb-phone">
                Numéro à rappeler
              </label>
              <input id="cb-phone" name="phone" type="tel" autoComplete="tel" className="field" required placeholder="06 12 34 56 78" />
            </div>
            <div>
              <label className="label" htmlFor="cb-date">
                Jour
              </label>
              <select id="cb-date" name="date" className="field" required>
                {callbackDays().map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cb-slot">
                Créneau
              </label>
              <select id="cb-slot" name="slot" className="field" defaultValue="matin">
                {Object.entries(CALLBACK_SLOTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="cb-topic">
                Sujet (facultatif)
              </label>
              <input id="cb-topic" name="topic" className="field" maxLength={500} placeholder="Ex. : configurer mes factures d'acompte" />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Submit>
                <Icon name="phone" size={16} /> Être rappelé
              </Submit>
            </div>
          </ActionForm>
        )}
        {callbacks.some((c) => c.status !== "demande") ? (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {callbacks
              .filter((c) => c.status !== "demande")
              .slice(0, 3)
              .map((c) => (
                <li key={c.id}>
                  {fmtDate(c.wished_on)} : {CALLBACK_STATUSES[c.status]}
                  {c.outcome ? ` (${c.outcome})` : ""}
                </li>
              ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Séances de prise en main en ligne">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">Aucune séance programmée pour le moment : demandez un rappel, nous vous guidons au téléphone.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {sessions.map((x) => {
              const left = x.capacity - x.registered;
              return (
                <li key={x.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{x.title}</p>
                    <p className="text-xs text-muted">
                      {when(x.starts_at)}, {x.duration_min} min, {left > 0 ? `${left} place(s) libre(s)` : "complet"}
                    </p>
                    {x.description ? <p className="mt-1 text-muted">{x.description}</p> : null}
                    {x.mine ? (
                      <p className="mt-1 flex flex-wrap gap-3 text-xs">
                        <span className="font-medium text-accent">Inscrit</span>
                        {x.meeting_url ? (
                          <a href={x.meeting_url} className="link" target="_blank" rel="noreferrer">
                            Rejoindre la séance
                          </a>
                        ) : null}
                        <a href={`/api/onboarding/${x.id}/agenda`} className="link">
                          Ajouter à mon agenda
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <ActionForm action={sessionRegistrationAction}>
                    <input type="hidden" name="id" value={x.id} />
                    {x.mine ? (
                      <>
                        <input type="hidden" name="leave" value="1" />
                        <Submit className="btn-ghost min-h-9">Se désinscrire</Submit>
                      </>
                    ) : left > 0 ? (
                      <Submit className="btn-secondary min-h-9">S&apos;inscrire</Submit>
                    ) : null}
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
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
      <p className="text-sm">
        <Link href="/app/nouveautes" className="link">
          Voir les nouveautés de Pilot-Makers
        </Link>
      </p>
    </div>
  );
}
