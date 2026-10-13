import Link from "next/link";
import { AuthCard } from "@/components/forms/AuthCard";
import { Notice } from "@/components/ui";
import { LoginForm } from "./LoginForm";
import { PasskeyLogin } from "@/components/Passkeys";

export const metadata = { title: "Connexion" };

export default async function Page({ searchParams }: { searchParams: Promise<{ reinitialise?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthCard
      title="Connexion"
      subtitle="Accédez à vos devis et à vos clients."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="link">
            Créer un compte
          </Link>
        </>
      }
    >
      {sp.reinitialise ? (
        <div className="mb-4">
          <Notice tone="success">Mot de passe modifié. Connectez-vous avec le nouveau.</Notice>
        </div>
      ) : null}
      <LoginForm next={sp.next ?? ""} />
      <div className="mt-4">
        <PasskeyLogin next={sp.next ?? ""} />
      </div>
    </AuthCard>
  );
}
