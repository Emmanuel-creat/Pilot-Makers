export const sql = /* sql */ `
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL DEFAULT '',
  email_verified_at timestamptz,
  locale text NOT NULL DEFAULT 'fr',
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  terms_version text,
  terms_accepted_at timestamptz,
  is_platform_admin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deletion_pending','deleted')),
  deletion_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_name text NOT NULL DEFAULT '',
  legal_name text NOT NULL DEFAULT '',
  legal_form text NOT NULL DEFAULT '',
  share_capital text NOT NULL DEFAULT '',
  rcs_rm text NOT NULL DEFAULT '',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'France',
  siren text NOT NULL DEFAULT '',
  siret text NOT NULL DEFAULT '',
  vat_number text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  logo_data text,
  signature_data text,
  trade text NOT NULL DEFAULT '',
  insurance_name text NOT NULL DEFAULT '',
  insurance_policy text NOT NULL DEFAULT '',
  insurance_coverage text NOT NULL DEFAULT '',
  insurance_area text NOT NULL DEFAULT '',
  insurance_decennale boolean NOT NULL DEFAULT false,
  bank_holder text NOT NULL DEFAULT '',
  bank_iban text NOT NULL DEFAULT '',
  bank_bic text NOT NULL DEFAULT '',
  vat_regime text NOT NULL DEFAULT 'normal' CHECK (vat_regime IN ('normal','franchise')),
  default_vat_bp integer NOT NULL DEFAULT 2000,
  hourly_rate text NOT NULL DEFAULT '',
  travel_fee text NOT NULL DEFAULT '',
  payment_terms text NOT NULL DEFAULT '',
  general_conditions text NOT NULL DEFAULT '',
  quote_prefix text NOT NULL DEFAULT 'D',
  next_quote_seq integer NOT NULL DEFAULT 1,
  default_validity_days integer NOT NULL DEFAULT 30,
  default_deposit_percent text NOT NULL DEFAULT '',
  quote_template text NOT NULL DEFAULT 'classique',
  accent_color text NOT NULL DEFAULT '#1f4e79',
  mail_subject_template text NOT NULL DEFAULT 'Votre devis {numero}',
  mail_body_template text NOT NULL DEFAULT '',
  reminder_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_history_org ON organization_history(org_id, created_at DESC);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset','delete','invite')),
  token_hash text NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_attempts (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  ip text NOT NULL DEFAULT '',
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email ON login_attempts(email, created_at DESC);
CREATE INDEX login_attempts_ip ON login_attempts(ip, created_at DESC);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'particulier' CHECK (type IN ('particulier','entreprise','copropriete','autre')),
  civility text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  billing_line1 text NOT NULL DEFAULT '',
  billing_line2 text NOT NULL DEFAULT '',
  billing_postal_code text NOT NULL DEFAULT '',
  billing_city text NOT NULL DEFAULT '',
  billing_country text NOT NULL DEFAULT 'France',
  site_same_as_billing boolean NOT NULL DEFAULT true,
  site_line1 text NOT NULL DEFAULT '',
  site_line2 text NOT NULL DEFAULT '',
  site_postal_code text NOT NULL DEFAULT '',
  site_city text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  siren text NOT NULL DEFAULT '',
  vat_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  contact_preference text NOT NULL DEFAULT 'email',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_org ON customers(org_id, archived_at);

CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reference text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'main_oeuvre',
  subcategory text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'u',
  unit_cost4 bigint,
  hourly_cost4 bigint,
  unit_price4 bigint NOT NULL DEFAULT 0,
  vat_bp integer NOT NULL DEFAULT 2000,
  supplier text NOT NULL DEFAULT '',
  duration_minutes integer,
  price_valid_until date,
  active boolean NOT NULL DEFAULT true,
  favorite boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'user',
  source_note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, reference)
);

CREATE TABLE catalog_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  old_price4 bigint,
  new_price4 bigint,
  old_cost4 bigint,
  new_cost4 bigint,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','incomplete','ready','sent','viewed','accepted','refused','expired','canceled','superseded')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  site_line1 text NOT NULL DEFAULT '',
  site_line2 text NOT NULL DEFAULT '',
  site_postal_code text NOT NULL DEFAULT '',
  site_city text NOT NULL DEFAULT '',
  validity_days integer NOT NULL DEFAULT 30,
  payment_terms text NOT NULL DEFAULT '',
  special_conditions text NOT NULL DEFAULT '',
  deposit_percent text NOT NULL DEFAULT '',
  estimated_duration text NOT NULL DEFAULT '',
  estimated_start text NOT NULL DEFAULT '',
  global_discount text NOT NULL DEFAULT '',
  template text NOT NULL DEFAULT '',
  internal_notes text NOT NULL DEFAULT '',
  current_version integer NOT NULL DEFAULT 0,
  draft_revision integer NOT NULL DEFAULT 0,
  total_ht_cents bigint NOT NULL DEFAULT 0,
  total_ttc_cents bigint NOT NULL DEFAULT 0,
  margin_cents bigint NOT NULL DEFAULT 0,
  issued_at timestamptz,
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  accepted_version integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX quotes_org_status ON quotes(org_id, status, updated_at DESC);
CREATE INDEX quotes_customer ON quotes(customer_id);

CREATE TABLE quote_sections (
  id uuid NOT NULL,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (quote_id, id)
);

CREATE TABLE quote_lines (
  id uuid NOT NULL,
  section_id uuid NOT NULL,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('item','pending','note')),
  catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
  nature text NOT NULL DEFAULT 'autre',
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  unit_price text NOT NULL DEFAULT '',
  unit_cost text NOT NULL DEFAULT '',
  discount_percent text NOT NULL DEFAULT '',
  vat_percent text NOT NULL DEFAULT '',
  estimated boolean NOT NULL DEFAULT false,
  estimate_note text NOT NULL DEFAULT '',
  PRIMARY KEY (quote_id, id),
  FOREIGN KEY (quote_id, section_id) REFERENCES quote_sections(quote_id, id) ON DELETE CASCADE
);
CREATE INDEX quote_lines_section ON quote_lines(quote_id, section_id, position);

CREATE TABLE quote_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  number text NOT NULL,
  snapshot jsonb NOT NULL,
  pdf bytea NOT NULL,
  pdf_sha256 text NOT NULL,
  snapshot_sha256 text NOT NULL,
  total_ht_cents bigint NOT NULL,
  total_ttc_cents bigint NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (quote_id, version)
);

CREATE TABLE document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  version integer,
  type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'user',
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_events_quote ON document_events(quote_id, created_at);
CREATE INDEX document_events_org ON document_events(org_id, created_at DESC);

CREATE TABLE share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  kind text NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  attachment_version_id uuid REFERENCES quote_versions(id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','bounced')),
  provider text NOT NULL DEFAULT 'outbox',
  provider_message_id text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX emails_org ON emails(org_id, created_at DESC);

CREATE TABLE plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_month_cents integer NOT NULL DEFAULT 0,
  price_year_cents integer NOT NULL DEFAULT 0,
  max_users integer NOT NULL DEFAULT 1,
  max_quotes_per_month integer,
  ai_quota_month integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  trial_days integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES plans(code),
  status text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month','year')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_end timestamptz,
  grace_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'simulated',
  provider_customer_id text,
  provider_subscription_id text,
  payment_method_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  type text NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number text NOT NULL UNIQUE,
  plan_code text NOT NULL,
  amount_ht_cents integer NOT NULL,
  amount_ttc_cents integer NOT NULL,
  status text NOT NULL CHECK (status IN ('paid','failed','refunded')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  cost_micro_eur bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_org ON usage_events(org_id, kind, created_at);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  org_id uuid,
  user_id uuid,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org ON audit_logs(org_id, created_at DESC);

CREATE TABLE error_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  message text NOT NULL,
  org_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  answer text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (code, name, description, price_month_cents, price_year_cents, max_users, max_quotes_per_month, ai_quota_month, features, trial_days, sort) VALUES
 ('decouverte', 'Découverte', 'Pour découvrir le logiciel', 0, 0, 1, 5, 0, '{"watermark": true, "margin": false, "reminders": false, "templates": false}', 0, 1),
 ('independant', 'Indépendant', 'Offre de lancement', 2900, 29000, 1, NULL, 0, '{"watermark": false, "margin": false, "reminders": false, "templates": false}', 14, 2),
 ('professionnel', 'Professionnel', 'Offre principale', 5900, 59000, 3, NULL, 100, '{"watermark": false, "margin": true, "reminders": true, "templates": true}', 14, 3),
 ('entreprise', 'Entreprise', 'Pour les petites équipes', 9900, 99000, 10, NULL, 300, '{"watermark": false, "margin": true, "reminders": true, "templates": true}', 14, 4);
`;
