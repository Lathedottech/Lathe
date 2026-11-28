-- Team Operations: teams, projects and tasks (task P7-02). Runs after the foundation
-- migrations (including 0005 scopes), as the owner role, in the app's own database.
--
-- A team IS a foundation scope of kind 'team' and a project a scope of kind 'project':
-- their primary key is the scope id, and a composite foreign key on (org_id, id, kind)
-- makes the database refuse a team or project without its scope, of the wrong kind, or
-- in another org. Permissions on a project are decided by canInScope over the chain
-- org -> team -> project (P7-01), so these tables carry no access rules themselves.

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  scope_kind text NOT NULL DEFAULT 'team' CHECK (scope_kind = 'team'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_org_id_id_unique UNIQUE (org_id, id),
  CONSTRAINT teams_org_id_name_unique UNIQUE (org_id, name),
  CONSTRAINT teams_scope_fk FOREIGN KEY (org_id, id, scope_kind)
    REFERENCES scopes (org_id, id, kind) ON DELETE CASCADE
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  scope_kind text NOT NULL DEFAULT 'project' CHECK (scope_kind = 'project'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_org_id_id_unique UNIQUE (org_id, id),
  CONSTRAINT projects_team_name_unique UNIQUE (org_id, team_id, name),
  CONSTRAINT projects_scope_fk FOREIGN KEY (org_id, id, scope_kind)
    REFERENCES scopes (org_id, id, kind) ON DELETE CASCADE,
  CONSTRAINT projects_team_fk FOREIGN KEY (org_id, team_id)
    REFERENCES teams (org_id, id) ON DELETE CASCADE
);
CREATE INDEX projects_org_id_team_id_idx ON projects (org_id, team_id);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  assignee_membership_id uuid,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_project_fk FOREIGN KEY (org_id, project_id)
    REFERENCES projects (org_id, id) ON DELETE CASCADE,
  CONSTRAINT tasks_assignee_fk FOREIGN KEY (org_id, assignee_membership_id)
    REFERENCES memberships (org_id, id) ON DELETE SET NULL (assignee_membership_id)
);
CREATE INDEX tasks_org_id_project_id_created_at_idx ON tasks (org_id, project_id, created_at, id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
CREATE POLICY teams_tenant_isolation ON teams
  FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_tenant_isolation ON projects
  FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant_isolation ON tasks
  FOR ALL USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE ON teams, projects TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO :"app_role";
