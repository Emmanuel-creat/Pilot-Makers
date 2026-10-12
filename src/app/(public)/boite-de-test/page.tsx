import Link from "next/link";
import { getDb } from "@/lib/db";
import { getCtx } from "@/lib/server/session";
import { Notice, fmtDate } from "@/components/ui";

export const metadata = { title: "Boîte de test", robots: { index: false } };

/**
 * Tant qu'aucun prestataire d'e-mail n'est branché, les messages restent dans
 * l'application. Cette page montre ceux adressés à l'utilisateur connecté.
 * Avec DEMO_OUTBOX=1 (démonstration uniquement), elle permet aussi de chercher
 * par adresse, pour tester la réinitialisation du mot de passe.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ adresse?: string }> }) {
  const { adresse } = await searchParams;
  const ctx = await getCtx();
  const demo = process.env.DEMO_OUTBOX === "1";
  const target = ctx?.email ?? (demo && adresse ? adresse.trim().toLowerCase() : null);
  const db = await getDb();
  const mails = target
    ? await db.query<{ id: string; subject: string; body: string; created_at: Date; status: string }>(
        "SELECT id, subject, body, created_at, status FROM emails WHERE to_address=$1 AND kind IN ('verify_email','password_reset','account_delete','invite') ORDER BY created_at DESC LIMIT 20",
        [target],
      )
    : [];
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold">Boîte de test</h1>
      <div className="mt-3">
        <Notice tone="warning">
          Aucun prestataire d'e-mail n'est encore branché : les messages de compte sont affichés ici au lieu d'être envoyés.
        </Notice>
      </div>
      {!ctx && demo ? (
        <form className="mt-4 flex gap-2">
          <input name="adresse" type="email" placeholder="Adresse e-mail" defaultValue={adresse} className="field" required />
          <button className="btn-secondary">Afficher</button>
        </form>
      ) : null}
      {!ctx && !demo ? (
        <p className="mt-4 text-sm">
          <Link href="/connexion" className="link">
            Connectez-vous
          </Link>{" "}
          pour voir les messages qui vous sont adressés.
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {mails.map((m) => (
          <article key={m.id} className="card p-4">
            <div className="flex justify-between gap-2 text-sm">
              <h2 className="font-medium">{m.subject}</h2>
              <span className="text-muted">{fmtDate(m.created_at, true)}</span>
            </div>
            <pre className="mt-3 text-sm whitespace-pre-wrap">
              {m.body.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part.replace(/^https?:\/\/[^/]+/, "")} className="link break-all">
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </pre>
          </article>
        ))}
        {target && mails.length === 0 ? <p className="text-sm text-muted">Aucun message.</p> : null}
      </div>
    </div>
  );
}
