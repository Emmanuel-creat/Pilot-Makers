import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Politique de contenu : tout vient du site lui-même. Les styles en ligne restent
 * permis (React les utilise pour les couleurs dynamiques), les scripts en ligne
 * aussi tant que Next.js en a besoin pour hydrater les pages ; aucun domaine
 * extérieur n'est autorisé et l'application ne peut pas être intégrée ailleurs,
 * sauf le formulaire de demande de devis (/integrer/...), fait pour le site des artisans.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");
const embedCsp = csp.replace("frame-ancestors 'none'", "frame-ancestors *");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "bcryptjs", "pdf-lib"],
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
        ],
      },
      {
        // Déclarée après la règle générale : ces valeurs la remplacent pour le formulaire à intégrer.
        source: "/integrer/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: embedCsp },
        ],
      },
    ];
  },
};

export default nextConfig;
