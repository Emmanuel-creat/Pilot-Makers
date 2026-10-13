// Règles de détection des secrets écrits par erreur dans le dépôt (clés d'API, clés privées, mots de passe en clair).
// Les motifs sont assemblés par morceaux pour que ce fichier ne se signale pas lui-même.

const j = (...p) => p.join("");

export const SECRET_RULES = [
  { id: "cle-privee", label: "clé privée", re: new RegExp(j("-----BEGIN ([A-Z]+ )?PRIV", "ATE KEY-----")) },
  { id: "aws", label: "clé d'accès AWS", re: new RegExp(j("\\bA", "KIA[0-9A-Z]{16}\\b")) },
  { id: "stripe", label: "clé secrète Stripe", re: new RegExp(j("\\b(sk|rk)_li", "ve_[0-9a-zA-Z]{16,}")) },
  { id: "stripe-webhook", label: "secret de webhook Stripe", re: new RegExp(j("\\bwh", "sec_[0-9a-zA-Z]{24,}")) },
  { id: "github", label: "jeton GitHub", re: new RegExp(j("\\b(gh[pousr]_[A-Za-z0-9]{36}|github", "_pat_[A-Za-z0-9_]{40,})")) },
  { id: "slack", label: "jeton Slack", re: new RegExp(j("\\bxo", "x[abprs]-[0-9A-Za-z-]{10,}")) },
  { id: "google", label: "clé d'API Google", re: new RegExp(j("\\bA", "Iza[0-9A-Za-z_-]{35}\\b")) },
  { id: "sendgrid", label: "clé SendGrid", re: new RegExp(j("\\bSG", "\\.[\\w-]{22}\\.[\\w-]{43}\\b")) },
  { id: "brevo", label: "clé Brevo", re: new RegExp(j("\\bxkey", "sib-[0-9a-f]{64}")) },
  {
    id: "url-mot-de-passe",
    label: "mot de passe dans une adresse de base de données",
    re: new RegExp(
      j(
        "\\b(postgres(ql)?|mysql|mongodb(\\+srv)?|redis)://[^\\s:/@]+:(?!(\\.\\.\\.|motdepasse|password|secret|xxx+|\\$\\{?\\w+\\}?)@)[^\\s@/]{4,}",
        "@",
      ),
    ),
  },
];

/** Une ligne marquée « secret-factice » est un exemple volontaire (documentation, test). */
export const ALLOW_MARK = j("secret-", "factice");

export function scanText(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    if (line.includes(ALLOW_MARK)) return;
    for (const r of SECRET_RULES) if (r.re.test(line)) found.push({ line: i + 1, rule: r.id, label: r.label });
  });
  return found;
}

/** Fichiers d'environnement réels : jamais dans le dépôt, seul le modèle .env.example y a sa place. */
export function forbiddenFile(path) {
  const name = path.split("/").pop();
  return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
}
