import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, Logo } from "@/components/Icon";
import { getDb } from "@/lib/db";
import { businessJsonLd, hasHours, hoursLines, jsonLdScript } from "@/lib/business-listing";
import { appUrl } from "@/lib/services/mail";
import { publicShowcase } from "@/lib/services/showcase";
import { labelsHeadline } from "@/lib/labels";
import { RequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicShowcase(await getDb(), slug);
  if (!p) return { title: "Page introuvable", robots: { index: false, follow: false } };
  const what = [p.trade, p.city].filter(Boolean).join(" à ");
  return {
    title: `${p.name}${what ? `, ${what}` : ""}`,
    description: p.intro.slice(0, 160) || `${p.name} : présentation, réalisations et demande de devis.`,
  };
}

/** Vitrine publique d'une entreprise, générée depuis son profil et ses chantiers. */
export default async function ShowcasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicShowcase(await getDb(), slug);
  if (!p) notFound();
  const website = p.website && /^https?:\/\//.test(p.website) ? p.website : p.website ? `https://${p.website}` : "";
  const ld = businessJsonLd({ ...p, url: appUrl(`/pro/${p.slug}`), logoUrl: null, website: p.website });
  return (
    <div className="min-h-screen bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          {p.logo ? <img src={p.logo} alt={`Logo de ${p.name}`} className="h-16 w-auto max-w-40 object-contain" /> : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <p className="text-muted">{[p.trade, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
            {p.labels.length ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-success" data-testid="labels-vitrine">
                <Icon name="star" size={16} /> {labelsHeadline(p.labels)}
              </p>
            ) : null}
            {p.area ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm">
                <Icon name="pin" size={16} className="text-muted" /> Intervient : {p.area}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <a href="#demande" className="btn-primary">
              <Icon name="send" size={16} /> Demander un devis
            </a>
            {p.visits ? (
              <Link href={`/pro/${p.slug}/visite`} className="btn-secondary">
                <Icon name="calendar" size={16} /> Prendre rendez-vous pour une visite
              </Link>
            ) : null}
          </div>
        </header>

        {p.intro ? (
          <section className="card p-6" aria-labelledby="presentation">
            <h2 id="presentation" className="mb-2 font-semibold">
              Présentation
            </h2>
            <p className="whitespace-pre-line">{p.intro}</p>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-2 p-5 text-sm">
            <h2 className="font-semibold">Coordonnées</h2>
            {p.phone ? (
              <p className="flex items-center gap-2">
                <Icon name="phone" size={16} className="text-muted" />
                <a className="link" href={`tel:${p.phone.replace(/\s/g, "")}`}>
                  {p.phone}
                </a>
              </p>
            ) : null}
            {p.email ? (
              <p className="flex items-center gap-2">
                <Icon name="mail" size={16} className="text-muted" />
                <a className="link" href={`mailto:${p.email}`}>
                  {p.email}
                </a>
              </p>
            ) : null}
            {website ? (
              <p className="flex items-center gap-2">
                <Icon name="link" size={16} className="text-muted" />
                <a className="link" href={website} rel="noopener nofollow" target="_blank">
                  {p.website.replace(/^https?:\/\//, "")}
                </a>
              </p>
            ) : null}
            {!p.phone && !p.email && !website ? <p className="text-muted">Contact par le formulaire ci-dessous.</p> : null}
            {hasHours(p.hours) ? (
              <div className="flex items-start gap-2">
                <Icon name="clock" size={16} className="mt-0.5 text-muted" />
                <ul aria-label="Horaires d'ouverture">
                  {hoursLines(p.hours).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="card space-y-2 p-5 text-sm">
            <h2 className="font-semibold">{p.labels.length ? "Garanties et labels" : "Garanties"}</h2>
            {p.decennale ? (
              <p className="flex items-start gap-2">
                <Icon name="shield" size={16} className="mt-0.5 text-success" />
                <span>
                  Assurance décennale{p.decennale.insurer ? ` : ${p.decennale.insurer}` : ""}
                  {p.decennale.area ? `, ${p.decennale.area}` : ""}
                </span>
              </p>
            ) : null}
            {p.labels.map((l) => (
              <p key={`${l.title}-${l.number}`} className="flex items-start gap-2">
                <Icon name="star" size={16} className="mt-0.5 text-success" />
                <span>
                  <span className="font-medium">{l.title}</span>
                  {l.number ? `, n° ${l.number}` : ""}
                  {l.detail ? <span className="block text-muted">{l.detail}</span> : null}
                </span>
              </p>
            ))}
            <p className="flex items-start gap-2">
              <Icon name="building" size={16} className="mt-0.5 text-muted" />
              <span>SIRET {p.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, "$1 $2 $3 $4")}</span>
            </p>
          </div>
        </section>

        {p.photos.length ? (
          <section className="card p-6" aria-labelledby="realisations">
            <h2 id="realisations" className="mb-3 font-semibold">
              Réalisations
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {p.photos.map((ph) => (
                <li key={ph.id}>
                  <figure>
                    <img
                      src={`/api/public/pro/${p.slug}/photos/${ph.id}`}
                      alt={ph.caption || "Réalisation"}
                      loading="lazy"
                      className="aspect-square w-full rounded-md border border-line object-cover"
                    />
                    {ph.caption || ph.city ? (
                      <figcaption className="mt-1 text-xs text-muted">{[ph.caption, ph.city].filter(Boolean).join(", ")}</figcaption>
                    ) : null}
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {p.reviews.count ? (
          <section className="card space-y-3 p-6" aria-labelledby="avis">
            <div>
              <h2 id="avis" className="font-semibold">
                Avis clients : {p.reviews.average!.toLocaleString("fr-FR")} sur 5 ({p.reviews.count} avis)
              </h2>
              <p className="text-xs text-muted">
                Avis déposés par des clients après leurs travaux, sur invitation de l&apos;entreprise, et publiés tels quels avec leur accord. L&apos;entreprise
                ne peut masquer un avis que s&apos;il est injurieux, hors sujet ou s&apos;il cite un tiers.
              </p>
            </div>
            <ul className="divide-y divide-line text-sm">
              {p.reviews.reviews.map((r, i) => (
                <li key={i} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Icon name="star" size={16} className="text-accent" /> {r.rating} sur 5
                    </span>
                    <span className="text-muted">
                      {r.authorName}
                      {r.city ? `, ${r.city}` : ""}, avis du {r.submittedAt.split("-").reverse().join("/")}
                      {r.workDate ? `, travaux du ${r.workDate.split("-").reverse().join("/")}` : ""}
                    </span>
                  </div>
                  {r.comment ? <p className="whitespace-pre-line">{r.comment}</p> : null}
                  {r.reply ? <p className="border-l-2 border-line pl-3 text-muted">Réponse de l&apos;entreprise : {r.reply}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="demande" className="card scroll-mt-4 p-6" aria-labelledby="demande-titre">
          <h2 id="demande-titre" className="mb-3 font-semibold">
            Demander un devis
          </h2>
          <RequestForm slug={p.slug} orgName={p.name} />
        </section>
      </main>
      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted">
        <Logo size={14} /> Page réalisée avec{" "}
        <Link className="link" href="/">
          Pilot-Makers
        </Link>
      </footer>
    </div>
  );
}
