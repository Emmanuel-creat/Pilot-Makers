import { deleteSsoAction, saveSsoAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { appUrl } from "@/lib/services/mail";
import { getSsoConfig, SSO_CALLBACK } from "@/lib/services/sso";

export const metadata = { title: "Connexion unique" };

/** Connexion unique d'entreprise : l'annuaire de l'entreprise (Microsoft Entra, Google Workspace, Okta...) identifie ses membres. */
export default async function SsoPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "settings")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Connexion unique" back={{ href: "/app/entreprise", label: "Entreprise" }} />
        <Notice tone="warning">Seul le gérant peut relier l&apos;annuaire de l&apos;entreprise.</Notice>
      </div>
    );
  }
  const c = await getSsoConfig(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Connexion unique"
        subtitle="Vos équipes se connectent avec le compte de l'annuaire de l'entreprise. Un départ désactivé dans l'annuaire ferme aussi l'accès ici."
        back={{ href: "/app/entreprise", label: "Entreprise" }}
      />
      <Notice title="Dans votre fournisseur d'identité">
        Créez une application OpenID Connect avec cette adresse de retour : <code className="break-all">{appUrl(SSO_CALLBACK)}</code>. Les comptes restent créés
        par invitation depuis Équipe ; la connexion unique vérifie l&apos;identité.
      </Notice>
      <section className="card p-4" aria-labelledby="sso-config">
        <h2 id="sso-config" className="mb-3 text-lg font-semibold">
          {c ? "Annuaire relié" : "Relier l'annuaire"}
        </h2>
        <ActionForm action={saveSsoAction}>
          <label className="block">
            <span className="label">Adresse de l&apos;émetteur</span>
            <input
              name="issuer"
              className="field"
              required
              defaultValue={c?.issuer ?? ""}
              placeholder="https://login.microsoftonline.com/.../v2.0"
              disabled={!canEdit}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Identifiant de l&apos;application</span>
              <input name="clientId" className="field" required defaultValue={c?.clientId ?? ""} disabled={!canEdit} />
            </label>
            <label className="block">
              <span className="label">Secret de l&apos;application</span>
              <input
                name="clientSecret"
                type="password"
                className="field"
                autoComplete="off"
                placeholder={c?.hasSecret ? "Enregistré, laissez vide pour le garder" : ""}
                disabled={!canEdit}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Domaines de messagerie de l&apos;entreprise</span>
            <input name="domains" className="field" required defaultValue={c?.domains.join(", ") ?? ""} placeholder="entreprise.fr" disabled={!canEdit} />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="enforced" value="1" defaultChecked={c?.enforced ?? false} className="mt-1 size-4" disabled={!canEdit} />
            <span>Imposer la connexion unique : le mot de passe ne suffit plus pour les adresses de ces domaines.</span>
          </label>
          {canEdit ? <Submit>Enregistrer</Submit> : null}
        </ActionForm>
        {c && canEdit ? (
          <form action={deleteSsoAction} className="mt-4">
            <button className="link text-sm text-danger">Délier l&apos;annuaire</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
