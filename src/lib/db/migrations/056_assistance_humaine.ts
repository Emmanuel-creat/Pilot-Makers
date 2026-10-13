/** Rappels téléphoniques demandés au support et séances de prise en main en ligne. */
export const sql = /* sql */ `
CREATE TABLE support_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  wished_on date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('matin', 'apres_midi')),
  topic text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'demande' CHECK (status IN ('demande', 'fait', 'injoignable', 'annule')),
  outcome text NOT NULL DEFAULT '',
  handled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_callbacks_open ON support_callbacks (wished_on, slot) WHERE status = 'demande';
CREATE INDEX support_callbacks_org ON support_callbacks (org_id, created_at DESC);

CREATE TABLE onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 45 CHECK (duration_min BETWEEN 15 AND 240),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  capacity integer NOT NULL DEFAULT 12 CHECK (capacity BETWEEN 1 AND 500),
  meeting_url text NOT NULL DEFAULT '',
  canceled_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_sessions_start ON onboarding_sessions (starts_at);

CREATE TABLE onboarding_registrations (
  session_id uuid NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
`;
