/** Adresse de signalement des failles : SECURITY_EMAIL, sinon l'adresse de contact des mentions légales. */
export function securityContact(): string | null {
  return (process.env.SECURITY_EMAIL || process.env.LEGAL_EMAIL || "").trim() || null;
}

/** Contenu du fichier /.well-known/security.txt (RFC 9116), valable un an. */
export function securityTxt(origin: string, now = new Date()): string {
  const contact = securityContact();
  const expires = new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();
  return [
    contact ? `Contact: mailto:${contact}` : `Contact: ${origin}/securite`,
    `Expires: ${expires}`,
    "Preferred-Languages: fr, en",
    `Policy: ${origin}/securite`,
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
}
