/** Connexion unique d'entreprise (OpenID Connect) : configuration par entreprise et demandes en cours. */
export const sql = /* sql */ `
CREATE TABLE org_sso (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  domains text[] NOT NULL,
  enforced boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sso_requests (
  state_hash text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  next_path text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL
);
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
DROP TABLE sso_requests;
DROP TABLE org_sso;
`;
