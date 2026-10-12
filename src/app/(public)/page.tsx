import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getDb } from "@/lib/db";
import { formatEuros } from "@/lib/calc/format";
import { listPlans } from "@/lib/services/billing";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: "user", title: "Choisissez le client", text: "Ou créez-le en quelques secondes, directement depuis le devis." },
  { icon: "box", title: "Ajoutez vos prestations", text: "Depuis votre catalogue, ou décrivez le chantier : l'assistant propose des lignes." },
  { icon: "check", title: "Vérifiez", text: "Quantités, prix, TVA : rien n'est validé sans vous. Les estimations sont signalées." },
  { icon: "send", title: "Envoyez et suivez", text: "PDF professionnel, lien sécurisé, acceptation en ligne et relances." },
];

const FEATURES = [
  { icon: "euro", title: "Calculs exacts", text: "Montants en centimes, arrondis documentés, TVA ventilée par taux. Zéro erreur arithmétique." },
  { icon: "chart", title: "Marge prévisionnelle", text: "Coût interne et prix de vente séparés. Le coût n'apparaît jamais sur le devis du client." },
  { icon: "history", title: "Versions figées", text: "Chaque devis émis est conservé tel quel, avec son empreinte. Une modification crée une nouvelle version." },
  { icon: "shield", title: "Mentions contrôlées", text: "Avant l'émission, le logiciel vérifie les informations obligatoires : assurance, adresse du chantier, validité." },
  { icon: "phone", title: "Sur le chantier", text: "Conçu pour le téléphone autant que pour l'ordinateur, avec sauvegarde automatique." },
  { icon: "download", title: "Vos données", text: "Export complet à tout moment. Si vous arrêtez de payer, vos documents restent accessibles." },
];

export default async function Home() {
  const plans = await listPlans(await getDb());
  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
              <Icon name="hammer" size={16} /> Pour les artisans du bâtiment
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Des devis professionnels en quelques minutes.</h1>
            <p className="mt-4 text-lg text-muted">
              Réutilisez vos tarifs, calculez automatiquement HT, TVA, TTC et marge, envoyez un PDF propre et suivez les réponses de vos
              clients.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/inscription" className="btn-primary px-5 py-3 text-base">
                Essayer gratuitement 14 jours
              </Link>
              <Link href="/connexion" className="btn-secondary px-5 py-3 text-base">
                J'ai déjà un compte
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted">Sans carte bancaire. Vos données restent exportables à tout moment.</p>
          </div>
          <div className="card overflow-hidden shadow-sm" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-sm">
              <span className="font-medium">Devis D-2026-0042</span>
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">Accepté</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="tabular">
                {[
                  ["Dépose de carrelage existant", "6 m²", "108,00"],
                  ["Pose de carrelage au sol", "6 m²", "270,00"],
                  ["Pose de faïence murale", "14,5 m²", "696,00"],
                  ["Réfection des joints", "20,5 m²", "287,00"],
                ].map(([l, q, t]) => (
                  <tr key={l} className="border-b border-line">
                    <td className="px-4 py-2">{l}</td>
                    <td className="px-2 py-2 text-right text-muted">{q}</td>
                    <td className="px-4 py-2 text-right">{t} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Total HT</span>
                <span className="tabular">1 361,00 €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">TVA 10 %</span>
                <span className="tabular">136,10 €</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total TTC</span>
                <span className="tabular">1 497,10 €</span>
              </div>
              <div className="flex justify-between text-xs text-success">
                <span>Marge prévisionnelle (interne)</span>
                <span className="tabular">41,2 %</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold">De la demande du client au devis envoyé</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white dark:text-[#0d1520]">
                  {i + 1}
                </span>
                <Icon name={s.icon} className="text-accent" />
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3">
              <div className="h-fit rounded-md bg-accent-soft p-2 text-accent">
                <Icon name={f.icon} />
              </div>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="tarifs" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold">Tarifs</h2>
        <p className="mt-1 text-sm text-muted">Prix hors taxes, sans engagement. Offres de lancement susceptibles d'évoluer.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div key={p.code} className={`card flex flex-col p-5 ${p.code === "professionnel" ? "border-accent ring-1 ring-accent" : ""}`}>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted">{p.description}</p>
              <div className="mt-4 text-3xl font-semibold tabular">
                {p.price_month_cents === 0 ? "0 €" : formatEuros(p.price_month_cents).replace(",00", "")}
                <span className="text-sm font-normal text-muted"> HT / mois</span>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                <li className="flex gap-2">
                  <Icon name="check" size={16} className="mt-0.5 text-success" />
                  {p.max_quotes_per_month ? `${p.max_quotes_per_month} devis émis par mois` : "Devis illimités"}
                </li>
                <li className="flex gap-2">
                  <Icon name="check" size={16} className="mt-0.5 text-success" />
                  {p.max_users} utilisateur{p.max_users > 1 ? "s" : ""}
                </li>
                {p.features.margin ? (
                  <li className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-success" />
                    Marge prévisionnelle
                  </li>
                ) : null}
                {p.features.reminders ? (
                  <li className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-success" />
                    Relances automatiques
                  </li>
                ) : null}
                {p.ai_quota_month > 0 ? (
                  <li className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-success" />
                    Assistant de préparation ({p.ai_quota_month} demandes / mois)
                  </li>
                ) : null}
                {p.features.watermark ? (
                  <li className="flex gap-2 text-muted">
                    <Icon name="info" size={16} className="mt-0.5" />
                    Mention discrète du logiciel sur le PDF
                  </li>
                ) : null}
              </ul>
              <Link href="/inscription" className={`mt-5 ${p.code === "professionnel" ? "btn-primary" : "btn-secondary"}`}>
                Commencer
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl font-semibold">L'assistant prépare, vous décidez</h2>
          <p className="mt-3 text-muted">
            L'assistant transforme votre description du chantier en lignes de devis. Il réutilise d'abord vos propres tarifs, signale chaque
            quantité estimée, pose les questions qui manquent et ne choisit jamais le taux de TVA à votre place. Aucun devis n'est émis sans votre
            confirmation explicite.
          </p>
        </div>
      </section>
    </>
  );
}
