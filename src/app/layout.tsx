import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/app/Display";

export const metadata: Metadata = {
  title: { default: "Pilot-Makers, devis pour artisans", template: "%s | Pilot-Makers" },
  description: "Créez des devis professionnels en quelques minutes, calculez vos prix et vos marges, suivez vos réponses.",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Pilot-Makers", statusBarStyle: "default" },
  applicationName: "Pilot-Makers",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
  ],
};

// Applique les préférences d'affichage avant l'affichage pour éviter un flash.
const themeScript = `try{var d=document.documentElement.dataset,s=localStorage,t=s.getItem("pm-theme"),x=s.getItem("pm-text"),c=s.getItem("pm-contrast");if(t==="dark"||t==="light")d.theme=t;if(x==="lg"||x==="xl")d.text=x;if(c==="high")d.contrast=c}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
