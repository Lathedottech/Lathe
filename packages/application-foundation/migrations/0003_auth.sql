-- P1-03: tables for Better Auth (email and password, server-side sessions).
-- Applied by the migration runner (src/db/migrate.ts) as the owner role.
--
-- Not tenant tables: no org_id and no RLS. Better Auth reads them before any
-- user or org is known (sign-in by email, session lookup by token). Only the
-- auth module (src/auth) queries them. The app role gets DML through the default
-- privileges from infra/postgres/init/roles.sql.in.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  -- Better Auth lower-cases emails; enforce it so two spellings cannot be two users.
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  -- Active org for this session. Set only by the server after it checks a
  -- membership (task P1-04); never taken from client input.
  active_org_id uuid REFERENCES organizations (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_unique UNIQUE (token)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  -- Password hash for the credential provider. Never the password itself.
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_provider_id_account_id_unique UNIQUE (provider_id, account_id)
);

CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verifications_identifier_idx ON verifications (identifier);

CREATE TABLE rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  count integer NOT NULL,
  last_request bigint NOT NULL,
  CONSTRAINT rate_limits_key_unique UNIQUE (key)
);

-- Close the gap left by P1-01: a membership must belong to a real user.
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
