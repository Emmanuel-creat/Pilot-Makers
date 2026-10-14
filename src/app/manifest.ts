import type { MetadataRoute } from "next";

/** Manifeste de l'application installable : icône sur l'écran d'accueil, plein écran, raccourcis. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Pilot-Makers, devis pour artisans",
    short_name: "Pilot-Makers",
    description: "Devis, factures et suivi des chantiers pour les artisans du bâtiment.",
    lang: "fr-FR",
    dir: "ltr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f6f8",
    theme_color: "#1f4e79",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Aujourd'hui", short_name: "Aujourd'hui", url: "/app/aujourdhui", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Devis en attente", url: "/app/devis?status=pending", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Nouveau devis", url: "/app/devis/nouveau", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Demandes clients", url: "/app/demandes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
