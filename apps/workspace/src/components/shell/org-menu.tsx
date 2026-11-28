'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { MembershipSummary } from '@lathe/shared-contracts';
import { postJson } from './browser-api';
import styles from './shell.module.css';

export interface OrgMenuProps {
  readonly memberships: readonly MembershipSummary[];
  readonly activeOrgId: string | null;
}

/**
 * Active organization and the user's role in it. Switching sends only a membership
 * id (`POST /v1/session/active-org`); the Engine checks it belongs to the user.
 */
export function OrgMenu({ memberships, activeOrgId }: OrgMenuProps) {
  const router = useRouter();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = memberships.find((m) => m.orgId === activeOrgId);

  if (memberships.length === 0) return <span className={styles.muted}>No organization</span>;

  const onChange = async (membershipId: string) => {
    if (membershipId === '') return;
    setPending(true);
    setError(null);
    const r = await postJson('/v1/session/active-org', { membershipId });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className={styles.menu}>
      <label htmlFor={id} className={styles.menuLabel}>
        Organization
      </label>
      <select
        id={id}
        className={styles.select}
        value={active?.membershipId ?? ''}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(e) => void onChange(e.target.value)}
      >
        {active === undefined && <option value="">Choose an organization</option>}
        {memberships.map((m) => (
          <option key={m.membershipId} value={m.membershipId}>
            {m.orgName}
          </option>
        ))}
      </select>
      {active !== undefined && (
        <span className={styles.role} data-testid="active-role">
          {active.role}
        </span>
      )}
      {error !== null && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
