import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listSessions } from "@/lib/services/accounts";
import { cancelDeletionAction, passwordAction, preferencesAction, requestDeletionAction, revokeSessionAction } from "@/app/actions";

export const metadata = { title: "Mon compte" };

function deviceName(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone ou iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navigateur";
  return `${nav} sur ${os}`;
}

export default async function AccountPage() {
  const ctx = await requirePageCtx();
  const [sessions, user] = await Promise.all([
    listSessions(ctx),
    ctx.db.query<{ name: string; locale: string; timezone: string; status: string; deletion_requested_at: Date | null; created_at: Date }>(
      "SELECT name, locale, timezone, status, deletion_requested_at, created_at FROM users WHERE id=$1",
      [ctx.userId],
    ),
  ]);
  const u = user[0];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Mon compte" subtitle={`${ctx.email}, inscrit le ${fmtDate(u.created_at)}`} />
      {u.status === "deletion_pending" ? (
        <Notice tone="danger" title="Suppression programmée">
          Votre compte sera supprimé 30 jours après le {fmtDate(u.deletion_requested_at)}.
          <form action={cancelDeletionAction} className="mt-2">
            <button className="btn-secondary">Annuler la suppression</button>
          </form>
        </Notice>
      ) : null}
      <Section title="Profil">
        <ActionForm action={preferencesAction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="p-name">
                Nom affiché
              </label>
              <input id="p-name" name="name" className="field" defaultValue={u.name} required />
            </div>
            <div>
              <label className="label" htmlFor="p-locale">
                Langue
              </label>
              <select id="p-locale" name="locale" className="field" defaultValue={u.locale}>
                <option value="fr-FR">Français</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="p-tz">
                Fuseau horaire
              </label>
              <select id="p-tz" name="timezone" className="field" defaultValue={u.timezone}>
                {["Europe/Paris", "America/Martinique", "America/Guadeloupe", "Indian/Reunion", "America/Cayenne", "Indian/Mayotte", "Pacific/Noumea", "Pacific/Tahiti"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Submit>Enregistrer</Submit>
          </div>
        </ActionForm>
      </Section>
      <Section title="Mot de passe" description="12 caractères minimum. Le changement ferme vos autres sessions.">
        <ActionForm action={passwordAction} resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="pw-cur">
                Mot de passe actuel
              </label>
              <input id="pw-cur" name="current" type="password" autoComplete="current-password" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="pw-new">
                Nouveau
              </label>
              <input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={12} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="pw-conf">
                Confirmation
              </label>
              <input id="pw-conf" name="confirm" type="password" autoComplete="new-password" minLength={12} className="field" required />
            </div>
          </div>
          <div className="flex justify-end">
            <Submit>Changer le mot de passe</Submit>
          </div>
        </ActionForm>
      </Section>
      <Section title="Sessions actives" description="Déconnectez un appareil perdu ou que vous n'utilisez plus.">
        <ul className="divide-y divide-line text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-3">
                <Icon name="device" className="text-muted" />
                <div>
                  <div className="font-medium">
                    {deviceName(s.user_agent)}
                    {s.id === ctx.sessionId ? <span className="ml-2 text-xs text-success">cet appareil</span> : null}
                  </div>
                  <div className="text-xs text-muted">
                    Dernière activité le {fmtDate(s.last_seen_at, true)}
                    {s.ip ? `, adresse ${s.ip}` : ""}
                  </div>
                </div>
              </div>
              {s.id !== ctx.sessionId ? (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-ghost min-h-8 text-sm text-danger">Déconnecter</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Mes données" description="Export complet : entreprise, clients, catalogue, devis, versions et historique, au format JSON.">
        <a href="/api/account/export" className="btn-secondary">
          <Icon name="download" size={16} /> Exporter toutes mes données
        </a>
      </Section>
      {u.status !== "deletion_pending" ? (
        <Section title="Supprimer mon compte" description="Un e-mail de confirmation est envoyé. La suppression devient définitive 30 jours après la confirmation.">
          <ActionForm action={requestDeletionAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="label" htmlFor="del-pw">
                Mot de passe
              </label>
              <input id="del-pw" name="password" type="password" autoComplete="current-password" className="field" required />
            </div>
            <Submit className="btn-danger">Demander la suppression</Submit>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  );
}
