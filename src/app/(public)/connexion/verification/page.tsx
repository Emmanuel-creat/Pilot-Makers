import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/forms/AuthCard";
import { VerifyForm } from "./VerifyForm";

export const metadata = { title: "Vérification en deux étapes" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  if (!(await cookies()).get("pm_2fa")) redirect("/connexion");
  return (
    <AuthCard title="Vérification en deux étapes" subtitle="Saisissez le code à 6 chiffres affiché par votre application d'authentification.">
      <VerifyForm next={sp.next ?? ""} />
    </AuthCard>
  );
}
