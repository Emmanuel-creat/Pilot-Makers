import Link from "next/link";
import { AuthCard } from "@/components/forms/AuthCard";
import { PROFESSIONS } from "@/lib/library";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Créer un compte" };

export default function Page() {
  return (
    <AuthCard
      title="Créer votre espace"
      subtitle="14 jours d'essai de l'offre Professionnel, sans carte bancaire."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="link">
            Se connecter
          </Link>
        </>
      }
    >
      <RegisterForm professions={PROFESSIONS} />
    </AuthCard>
  );
}
