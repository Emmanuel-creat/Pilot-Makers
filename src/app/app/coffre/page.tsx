import { Notice, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listVaultFiles } from "@/lib/services/vault";
import { Vault } from "./Vault";

export const metadata = { title: "Coffre chiffré" };

/** Coffre chiffré : pièces confidentielles chiffrées sur l'appareil, illisibles pour le serveur. */
export default async function VaultPage() {
  const ctx = await requirePageCtx();
  const files = await listVaultFiles(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Coffre chiffré"
        subtitle="Pour les pièces confidentielles : contrats de travail, pièces d'identité, plans sensibles. Elles sont chiffrées sur votre appareil avant l'envoi, nom compris."
      />
      <Notice tone="warning" title="Gardez votre phrase secrète">
        Elle n&apos;est jamais envoyée ni enregistrée. Sans elle, personne ne peut rouvrir les pièces, pas même l&apos;assistance. Transmettez-la de vive voix
        aux personnes de l&apos;équipe qui en ont besoin.
      </Notice>
      <Vault
        canEdit={canEdit}
        initial={files.map((f) => ({ id: f.id, size: f.size, envelope: f.envelope, createdAt: new Date(f.createdAt).toISOString(), author: f.author }))}
      />
    </div>
  );
}
