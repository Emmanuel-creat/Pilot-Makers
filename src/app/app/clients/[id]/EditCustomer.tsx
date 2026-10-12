"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerForm, type CustomerFormValue } from "@/components/editor/CustomerForm";

export function EditCustomer({ id, initial }: { id: string; initial: CustomerFormValue }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <CustomerForm
        customerId={id}
        initial={initial}
        onSaved={() => {
          setSaved(true);
          router.refresh();
        }}
      />
      {saved ? (
        <p className="mt-2 text-sm text-success" role="status">
          Modifications enregistrées.
        </p>
      ) : null}
    </>
  );
}
