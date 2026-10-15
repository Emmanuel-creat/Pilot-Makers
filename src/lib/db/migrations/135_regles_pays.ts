/** Règles par pays publiées par l'administration (taux de TVA, mentions), applicables à une date donnée. */
export const sql = /* sql */ `
CREATE TABLE country_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  effective_from date NOT NULL,
  vat_options jsonb NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, effective_from)
);
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
DROP TABLE country_rule_versions;
`;
