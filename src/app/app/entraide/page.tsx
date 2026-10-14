import Link from "next/link";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { TOPICS } from "@/lib/community";
import { requirePageCtx } from "@/lib/server/session";
import { listQuestions } from "@/lib/services/community";
import { communityAskAction } from "@/app/actions";

export const metadata = { title: "Entraide" };

type SP = { theme?: string; q?: string; filtre?: string };
const FILTERS = { "": "Toutes", sans_reponse: "Sans réponse", miennes: "Mes questions" } as const;

export default async function CommunityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const filter = sp.filtre === "sans_reponse" || sp.filtre === "miennes" ? sp.filtre : "";
  const questions = await listQuestions(ctx, { topic: sp.theme, q: sp.q, filter });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Entraide entre artisans"
        subtitle="Posez une question de métier, de gestion ou de normes ; les confrères répondent. Les messages sont signés par le métier et le département, sans nom."
      />
      <Section title="Poser une question">
        <ActionForm action={communityAskAction} className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <div>
              <label className="label" htmlFor="q-topic">
                Thème
              </label>
              <select id="q-topic" name="topic" className="field" defaultValue="technique">
                {Object.entries(TOPICS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-title">
                Votre question
              </label>
              <input id="q-title" name="title" className="field" placeholder="Ex. Quel primaire sur un ancien carrelage avant ragréage ?" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="q-body">
              Précisions (support, contraintes, ce que vous avez déjà essayé)
            </label>
            <textarea id="q-body" name="body" rows={3} className="field" />
          </div>
          <p className="text-xs text-muted">Pas de téléphone ni d&apos;e-mail dans les messages publics. Un message signalé trois fois est masqué.</p>
          <Submit>Publier la question</Submit>
        </ActionForm>
      </Section>
      <form className="flex flex-wrap items-end gap-2 text-sm" role="search">
        <div>
          <label className="label" htmlFor="f-q">
            Rechercher
          </label>
          <input id="f-q" name="q" defaultValue={sp.q ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="f-theme">
            Thème
          </label>
          <select id="f-theme" name="theme" defaultValue={sp.theme ?? ""} className="field">
            <option value="">Tous</option>
            {Object.entries(TOPICS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-filtre">
            Afficher
          </label>
          <select id="f-filtre" name="filtre" defaultValue={filter} className="field">
            {Object.entries(FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {questions.length === 0 ? (
        <Empty icon="team" title="Aucune question pour ces critères">
          Soyez le premier à demander un conseil : un confrère a sûrement déjà rencontré le cas.
        </Empty>
      ) : (
        <ul className="card divide-y divide-line" data-testid="questions-entraide">
          {questions.map((q) => (
            <li key={q.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0">
                <Link href={`/app/entraide/${q.id}`} className="link font-medium">
                  {q.title}
                </Link>
                <span className="block text-xs text-muted">
                  {[TOPICS[q.topic], q.author, fmtDate(q.createdAt), q.mine ? "votre question" : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={`text-xs ${q.resolved ? "text-success" : q.answers ? "" : "text-warning"}`}>
                {q.resolved ? "Résolue" : q.answers ? `${q.answers} réponse${q.answers > 1 ? "s" : ""}` : "Sans réponse"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
