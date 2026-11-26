-- P3-01: Factory Engine core tables. Applied after the foundation migrations,
-- as the owner role, by runMigrations() from @lathe/application-foundation.
--
-- Every table is a tenant table: org_id NOT NULL, RLS enabled and forced, one
-- policy on app_current_org_id() (foundation migration 0002). Child rows carry
-- the parent's org_id in a composite foreign key, so a row in one org can never
-- point at a parent in another org. Evidence-like tables are append-only for the
-- app role.

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{0,62}$'),
  target_app text NOT NULL CHECK (target_app ~ '^[a-z][a-z0-9-]{0,62}$'),
  repo_owner text,
  repo_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_org_id_slug_unique UNIQUE (org_id, slug),
  CONSTRAINT projects_id_org_id_unique UNIQUE (id, org_id),
  CONSTRAINT projects_repo_both_or_none CHECK ((repo_owner IS NULL) = (repo_name IS NULL))
);

CREATE TABLE specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 100000),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT specs_project_id_version_unique UNIQUE (project_id, version),
  CONSTRAINT specs_id_org_id_unique UNIQUE (id, org_id),
  CONSTRAINT specs_project_fkey FOREIGN KEY (project_id, org_id) REFERENCES projects (id, org_id) ON DELETE RESTRICT
);
CREATE INDEX specs_org_id_project_id_idx ON specs (org_id, project_id);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  spec_id uuid NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_id_org_id_unique UNIQUE (id, org_id),
  CONSTRAINT plans_spec_fkey FOREIGN KEY (spec_id, org_id) REFERENCES specs (id, org_id) ON DELETE RESTRICT
);

CREATE TABLE plan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL,
  key text NOT NULL CHECK (key ~ '^T[0-9]{1,3}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  paths text[] NOT NULL CHECK (cardinality(paths) >= 1),
  acceptance_checks text[] NOT NULL CHECK (cardinality(acceptance_checks) >= 1),
  depends_on text[] NOT NULL DEFAULT '{}',
  CONSTRAINT plan_tasks_plan_id_key_unique UNIQUE (plan_id, key),
  CONSTRAINT plan_tasks_plan_fkey FOREIGN KEY (plan_id, org_id) REFERENCES plans (id, org_id) ON DELETE CASCADE
);

CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  spec_id uuid NOT NULL,
  plan_id uuid,
  state text NOT NULL CHECK (state IN ('DEFINED', 'PLANNED', 'BUILDING', 'VERIFYING', 'REPAIRING', 'AWAITING_APPROVAL', 'DELIVERED', 'FAILED', 'CANCELLED')),
  demo boolean NOT NULL DEFAULT false,
  fault_injection text,
  repair_attempts integer NOT NULL DEFAULT 0 CHECK (repair_attempts BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runs_id_org_id_unique UNIQUE (id, org_id),
  -- Demo fault injection only on demo runs, and only the one named fault (task P5-05).
  CONSTRAINT runs_fault_only_on_demo CHECK (fault_injection IS NULL OR (demo AND fault_injection = 'drop-tenant-filter')),
  CONSTRAINT runs_project_fkey FOREIGN KEY (project_id, org_id) REFERENCES projects (id, org_id) ON DELETE RESTRICT,
  CONSTRAINT runs_spec_fkey FOREIGN KEY (spec_id, org_id) REFERENCES specs (id, org_id) ON DELETE RESTRICT,
  CONSTRAINT runs_plan_fkey FOREIGN KEY (plan_id, org_id) REFERENCES plans (id, org_id) ON DELETE RESTRICT
);
CREATE INDEX runs_org_id_project_id_idx ON runs (org_id, project_id);

CREATE TABLE run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 0),
  type text NOT NULL CHECK (type ~ '^[a-z][a-z_]{0,62}$'),
  payload jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT run_events_run_id_seq_unique UNIQUE (run_id, seq),
  CONSTRAINT run_events_run_fkey FOREIGN KEY (run_id, org_id) REFERENCES runs (id, org_id) ON DELETE RESTRICT
);
CREATE INDEX run_events_org_id_run_id_idx ON run_events (org_id, run_id);

CREATE TABLE gate_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt BETWEEN 0 AND 3),
  gate text NOT NULL CHECK (gate IN ('protected-paths', 'static', 'tests', 'tenant-isolation', 'rbac', 'properties', 'security')),
  status text NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'not_run')),
  result_hash text NOT NULL CHECK (result_hash ~ '^[a-f0-9]{64}$'),
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gate_results_run_attempt_gate_unique UNIQUE (run_id, attempt, gate),
  CONSTRAINT gate_results_run_fkey FOREIGN KEY (run_id, org_id) REFERENCES runs (id, org_id) ON DELETE RESTRICT
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (subject_type IN ('spec', 'plan', 'delivery')),
  subject_id uuid NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  approver_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_org_id_subject_idx ON approvals (org_id, subject_type, subject_id);

-- Row-level security on every engine table.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_tenant_isolation ON projects FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE specs FORCE ROW LEVEL SECURITY;
CREATE POLICY specs_tenant_isolation ON specs FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_tenant_isolation ON plans FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_tasks_tenant_isolation ON plan_tasks FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs FORCE ROW LEVEL SECURITY;
CREATE POLICY runs_tenant_isolation ON runs FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_events FORCE ROW LEVEL SECURITY;
CREATE POLICY run_events_tenant_isolation ON run_events FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_results FORCE ROW LEVEL SECURITY;
CREATE POLICY gate_results_tenant_isolation ON gate_results FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY approvals_tenant_isolation ON approvals FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());

-- Evidence-like records are append-only for the app role.
REVOKE UPDATE, DELETE ON TABLE run_events FROM :"app_role";
REVOKE UPDATE, DELETE ON TABLE gate_results FROM :"app_role";
REVOKE UPDATE, DELETE ON TABLE approvals FROM :"app_role";

-- Deleting a parent must never cascade into append-only evidence (FKs above are
-- RESTRICT). The app role cannot delete the parents either; the owner keeps DELETE.
REVOKE DELETE ON TABLE runs, specs, plans, projects FROM :"app_role";
