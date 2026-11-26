-- Support Desk SLA (task P6-02). Due times are stored when a ticket is opened (and when its
-- priority changes), so the SLA of an existing ticket never shifts if the policy table in
-- src/sla/policy.ts changes later. The policy lives in code; the backfill below uses the
-- same values for tickets that existed before this migration.

ALTER TABLE tickets
  ADD COLUMN first_response_due_at timestamptz,
  ADD COLUMN resolution_due_at timestamptz,
  -- First public reply by staff. Internal notes do not count.
  ADD COLUMN first_response_at timestamptz,
  -- First time the ticket reached resolved or closed; cleared when it is reopened.
  ADD COLUMN resolved_at timestamptz;

-- The owner is subject to the forced RLS policy too, so without an org context the backfill
-- would update no row. Lift FORCE for this one statement, inside the migration's transaction,
-- and restore it right after; the app role is never affected.
ALTER TABLE tickets NO FORCE ROW LEVEL SECURITY;

UPDATE tickets SET
  first_response_due_at = created_at + CASE priority
    WHEN 'urgent' THEN interval '1 hour'
    WHEN 'high' THEN interval '4 hours'
    WHEN 'normal' THEN interval '1 day'
    ELSE interval '2 days' END,
  resolution_due_at = created_at + CASE priority
    WHEN 'urgent' THEN interval '4 hours'
    WHEN 'high' THEN interval '1 day'
    WHEN 'normal' THEN interval '3 days'
    ELSE interval '7 days' END,
  resolved_at = CASE WHEN status IN ('resolved', 'closed') THEN updated_at END;

ALTER TABLE tickets FORCE ROW LEVEL SECURITY;

ALTER TABLE tickets
  ALTER COLUMN first_response_due_at SET NOT NULL,
  ALTER COLUMN resolution_due_at SET NOT NULL,
  ADD CONSTRAINT tickets_sla_due_order CHECK (
    first_response_due_at > created_at AND resolution_due_at >= first_response_due_at
  ),
  ADD CONSTRAINT tickets_resolved_at_matches_status CHECK (
    (resolved_at IS NULL) = (status NOT IN ('resolved', 'closed'))
  );

CREATE INDEX tickets_org_id_resolution_due_at_idx ON tickets (org_id, resolution_due_at)
  WHERE resolved_at IS NULL;
CREATE INDEX tickets_org_id_first_response_due_at_idx ON tickets (org_id, first_response_due_at)
  WHERE first_response_at IS NULL;
