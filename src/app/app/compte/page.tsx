import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { DisplaySettings, InstallApp } from "@/components/app/Display";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { deviceName } from "@/lib/device";
import { requirePageCtx } from "@/lib/server/session";
import { listSessions } from "@/lib/services/accounts";
import {
  beginTwoFactorAction,
  cancelDeletionAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  passwordAction,
  preferencesAction,
  regenerateRecoveryAction,
  requestDeletionAction,
  revokeSessionAction,
} from "@/app/actions";
import { pendingTwoFactorSetup, twoFactorState } from "@/lib/services/two-factor";
import { CodesForm } from "./TwoFactor";
import { PasskeyManager } from "@/components/Passkeys";
import { listPasskeys } from "@/lib/services/passkeys";
import { PushSettings } from "@/components/PushSettings";
import { listPushDevices } from "@/lib/services/push";

export const metadata = { title: "Mon compte" };

const codeField = (id: string) => (
  <div>
    <label className="label" htmlFor={id}>
      Code de l'application ou code de secours
    </label>
    <input id={id} name="code" autoComplete="one-time-code" className="field font-mono" required />
  </div>
);

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ double?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const [tf, pending, passkeys, pushDevices] = await Promise.all([
    twoFactorState(ctx.db, ctx.userId),
    pendingTwoFactorSetup(ctx),
    listPasskeys(ctx),
    listPushDevices(ctx),
  ]);
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
      <Section title="Affichage" description="Thème, taille du texte et contraste pour travailler confortablement, au bureau comme sur le chantier.">
        <DisplaySettings />
      </Section>
      <Section title="Application sur le téléphone" description="Installez Pilot-Makers comme une application : icône sur l'écran d'accueil et plein écran.">
        <InstallApp />
      </Section>
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
                {[
                  "Europe/Paris",
                  "America/Martinique",
                  "America/Guadeloupe",
                  "Indian/Reunion",
                  "America/Cayenne",
                  "Indian/Mayotte",
                  "Pacific/Noumea",
                  "Pacific/Tahiti",
                ].map((t) => (
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
      {sp.double === "requis" && !tf.enabled ? (
        <Notice tone="warning" title="Double authentification requise">
          L'administration de la plateforme n'est accessible qu'avec la double authentification activée.
        </Notice>
      ) : null}
      <Section
        title="Notifications sur le téléphone"
        description="Soyez prévenu dès qu'un client ouvre, accepte ou refuse un devis, vous écrit, qu'un sous-traitant répond ou qu'une demande de devis arrive."
      >
        <PushSettings devices={pushDevices} />
      </Section>
      <Section
        title="Clés d'accès"
        description="Connectez-vous sans mot de passe, avec l'empreinte, le visage ou le code de votre téléphone ou ordinateur. Une clé d'accès ne peut pas être volée par un faux site et vaut double authentification."
      >
        <PasskeyManager initial={passkeys} />
      </Section>
      <Section
        title="Double authentification"
        description="Après le mot de passe, un code à 6 chiffres affiché par une application d'authentification (Google Authenticator, Microsoft Authenticator, 2FAS, Aegis...) est demandé."
      >
        {tf.enabled ? (
          <div className="space-y-5">
            <Notice tone="success">
              Activée le {fmtDate(tf.enabledAt)}. {tf.recoveryLeft} code{tf.recoveryLeft > 1 ? "s" : ""} de secours restant
              {tf.recoveryLeft > 1 ? "s" : ""}.
            </Notice>
            <div className="grid gap-5 sm:grid-cols-2">
              <CodesForm action={regenerateRecoveryAction}>
                <h3 className="text-sm font-semibold">Nouveaux codes de secours</h3>
                {codeField("tf-regen")}
                <button className="btn-secondary">Générer de nouveaux codes</button>
              </CodesForm>
              <ActionForm action={disableTwoFactorAction} className="space-y-3">
                <h3 className="text-sm font-semibold">Désactiver</h3>
                <div>
                  <label className="label" htmlFor="tf-pw">
                    Mot de passe
                  </label>
                  <input id="tf-pw" name="password" type="password" autoComplete="current-password" className="field" required />
                </div>
                {codeField("tf-off")}
                <Submit className="btn-danger">Désactiver</Submit>
              </ActionForm>
            </div>
          </div>
        ) : pending ? (
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <div
              className="rounded-md border border-line bg-white p-2"
              aria-label="QR code à scanner avec l'application d'authentification"
              role="img"
              dangerouslySetInnerHTML={{ __html: pending.svg }}
            />
            <CodesForm action={confirmTwoFactorAction}>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Ouvrez votre application d'authentification et scannez le QR code.</li>
                <li>
                  Sans appareil photo, saisissez la clé :{" "}
                  <code className="break-all font-mono text-xs">{pending.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                </li>
                <li>Recopiez le code à 6 chiffres affiché.</li>
              </ol>
              <div>
                <label className="label" htmlFor="tf-first">
                  Code à 6 chiffres
                </label>
                <input
                  id="tf-first"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  className="field max-w-40 font-mono"
                  required
                />
              </div>
              <Submit>Activer</Submit>
            </CodesForm>
          </div>
        ) : (
          <form action={beginTwoFactorAction}>
            <button className="btn-primary">Activer la double authentification</button>
          </form>
        )}
      </Section>
      <Section title="Mot de passe" description="10 caractères minimum, avec des lettres et des chiffres. Le changement ferme vos autres sessions.">
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
              <input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={10} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="pw-conf">
                Confirmation
              </label>
              <input id="pw-conf" name="confirm" type="password" autoComplete="new-password" minLength={10} className="field" required />
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
      <Section
        title="Mes données"
        description={
          ctx.role === "member"
            ? "Export de vos données personnelles au format JSON."
            : "Export complet en formats ouverts : archive ZIP avec tableaux CSV pour Excel, devis, factures et procès-verbaux en PDF, photos de chantier et données JSON. Vous pouvez partir avec tout, à tout moment."
        }
      >
        <div className="flex flex-wrap gap-2">
          {ctx.role !== "member" ? (
            <a href="/api/account/export?format=zip" className="btn-primary">
              <Icon name="download" size={16} /> Tout télécharger (ZIP)
            </a>
          ) : null}
          <a href="/api/account/export" className="btn-secondary">
            <Icon name="download" size={16} /> Données au format JSON
          </a>
        </div>
      </Section>
      {u.status !== "deletion_pending" ? (
        <Section
          title="Supprimer mon compte"
          description="Un e-mail de confirmation est envoyé. La suppression devient définitive 30 jours après la confirmation."
        >
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
