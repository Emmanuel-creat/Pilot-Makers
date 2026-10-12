"use client";

import { useRouter } from "next/navigation";
import { CustomerForm } from "@/components/editor/CustomerForm";

export function NewCustomer() {
  const router = useRouter();
  return <CustomerForm onSaved={(id) => router.push(`/app/clients/${id}`)} onCancel={() => router.push("/app/clients")} />;
}
