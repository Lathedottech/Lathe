-- P1-02: row-level security for tenant isolation.
-- Applied by the migration runner (src/db/migrate.ts) as the owner role.
--
-- Context is set per transaction by withTenant() / withUser() with
-- set_config(..., true), the parameterized form of SET LOCAL.
-- After a transaction that set it, current_setting() returns '' rather than
-- NULL, and ''::uuid raises an error, hence NULLIF. No context means NULL, and
-- `x = NULL` is never true, so every policy below fails closed.

CREATE FUNCTION app_current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- memberships: tenant table (created through tenantTable()).
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON memberships
  FOR ALL
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());

-- A user may read their own memberships in every org (withUser, task P1-04).
-- SELECT only: it never allows writes.
CREATE POLICY memberships_self_read ON memberships
  FOR SELECT
  USING (user_id = app_current_user_id());

CREATE INDEX memberships_user_id_idx ON memberships (user_id);

-- organizations: the tenant row itself. Creating an org means choosing its id
-- first and inserting it inside withTenant(newId), together with the first
-- membership (task P1-04).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_tenant_isolation ON organizations
  FOR ALL
  USING (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

CREATE POLICY organizations_member_read ON organizations
  FOR SELECT
  USING (id IN (SELECT m.org_id FROM memberships m WHERE m.user_id = app_current_user_id()));

-- audit_events: readable only for the current org. Rows without an org (denied
-- before membership resolution) can be written but are not readable by the app.
-- No UPDATE or DELETE policy, in addition to the missing grants from 0001.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_tenant_read ON audit_events
  FOR SELECT
  USING (org_id = app_current_org_id());

CREATE POLICY audit_events_insert ON audit_events
  FOR INSERT
  WITH CHECK (org_id IS NULL OR org_id = app_current_org_id());
