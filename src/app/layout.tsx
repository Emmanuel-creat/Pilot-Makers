import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pilot-Makers, devis pour artisans", template: "%s | Pilot-Makers" },
  description: "Créez des devis professionnels en quelques minutes, calculez vos prix et vos marges, suivez vos réponses.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
  ],
};

// Applique le thème choisi avant l'affichage pour éviter un flash.
const themeScript = `try{var t=localStorage.getItem("pm-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
