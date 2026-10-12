import { AuthCard } from "@/components/forms/AuthCard";
import { ResetForm } from "./ResetForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Toutes vos sessions ouvertes seront fermées.">
      <ResetForm token={jeton ?? ""} />
    </AuthCard>
  );
}
