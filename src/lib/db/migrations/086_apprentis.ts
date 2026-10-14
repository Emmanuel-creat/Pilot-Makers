/** Parcours de formation des apprentis : contrat, tuteur, jours d'école et compétences suivies. */
export const sql = /* sql */ `
CREATE TABLE apprentices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  diploma text NOT NULL DEFAULT '',
  school text NOT NULL DEFAULT '',
  contract_start date,
  contract_end date,
  school_days smallint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE TABLE apprentice_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  apprentice_id uuid NOT NULL REFERENCES apprentices(id) ON DELETE CASCADE,
  category text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'a_voir' CHECK (level IN ('a_voir', 'montre', 'accompagne', 'autonome')),
  note text NOT NULL DEFAULT '',
  updated_at timestamptz,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX apprentice_skills_apprentice ON apprentice_skills (apprentice_id, position);
`;
