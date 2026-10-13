"use client";

import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";

/** Efface de l'appareil ce qui sert au travail sans réseau : devis gardés et modifications non envoyées. */
export function forgetOfflineData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("pm-brouillon:")) localStorage.removeItem(k);
  } catch {
    // Stockage indisponible : rien n'y a été gardé.
  }
  if (typeof caches !== "undefined") void caches.delete("pm-devis-v1").catch(() => {});
}

function unsentChanges() {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("pm-brouillon:"));
  } catch {
    return false;
  }
}

/** Déconnexion : prévient s'il reste des modifications faites hors connexion, puis efface les copies locales. */
export function LogoutForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form
      action={logoutAction}
      className={className}
      onSubmit={(e) => {
        if (unsentChanges() && !window.confirm("Des modifications faites hors connexion n'ont pas encore été envoyées. Se déconnecter quand même ?")) {
          e.preventDefault();
          return;
        }
        forgetOfflineData();
      }}
    >
      {children}
    </form>
  );
}
