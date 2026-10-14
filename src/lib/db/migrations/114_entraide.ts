/** Communauté d'entraide entre artisans : questions, réponses, votes et signalements, ouverts à tous les comptes. */
export const sql = /* sql */ `
CREATE TABLE community_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  topic text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  accepted_answer_id uuid,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_questions_recent ON community_questions (created_at DESC);
CREATE TABLE community_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_answers_question ON community_answers (question_id);
CREATE TABLE community_votes (
  answer_id uuid NOT NULL REFERENCES community_answers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id, user_id)
);
CREATE TABLE community_reports (
  target_kind text NOT NULL CHECK (target_kind IN ('question', 'reponse')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, user_id)
);
`;
