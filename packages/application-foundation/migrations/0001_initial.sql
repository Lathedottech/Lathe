-- P1-01: organizations, memberships and append-only audit events.
-- Run this migration as LATHE_DB_OWNER_ROLE with psql variable:
--   psql -v app_role="$LATHE_DB_APP_ROLE" -f 0001_initial.sql
-- The app role variable is required because its name is environment-specific.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_org_id_user_id_unique UNIQUE (org_id, user_id)
);

CREATE INDEX memberships_org_id_idx ON memberships (org_id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  org_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  outcome text NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_outcome_check CHECK (outcome IN ('allowed', 'denied', 'success', 'failure'))
);

CREATE INDEX audit_events_org_id_idx ON audit_events (org_id);
CREATE INDEX audit_events_request_id_idx ON audit_events (request_id);

-- The bootstrap grants DML on all owner-created tables to the app role. Audit
-- events are append-only, so remove mutation privileges from that role.
REVOKE UPDATE, DELETE ON TABLE audit_events FROM :"app_role";
REVOKE UPDATE, DELETE ON TABLE audit_events FROM PUBLIC;

-- Make the audit table append-only at the database privilege layer. The owner
-- role retains ownership and can write migrations, but the app role cannot
-- update or delete events.
