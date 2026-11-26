'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { callApi } from './api';
import ui from './ui.module.css';

/** Shared state for a form that calls one route: pending flag and the last error. */
function useSubmit() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (
    call: () => ReturnType<typeof callApi>,
    onOk?: (data: unknown) => void,
  ): Promise<void> => {
    setPending(true);
    setError(null);
    const r = await call();
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onOk?.(r.data);
    router.refresh();
  };
  return { router, pending, error, run };
}

const ErrorLine = ({ error }: { error: string | null }) =>
  error ? (
    <p className={ui.error} role="alert">
      {error}
    </p>
  ) : null;

export function SignInForm() {
  const { router, pending, error, run } = useSubmit();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(
      () =>
        callApi('POST', '/auth/sign-in/email', {
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
        }),
      () => router.push('/teams'),
    );
  };
  return (
    <form className={ui.stack} onSubmit={onSubmit}>
      <label className={ui.label}>
        Email
        <input className={ui.input} name="email" type="email" autoComplete="email" required />
      </label>
      <label className={ui.label}>
        Password
        <input
          className={ui.input}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <ErrorLine error={error} />
      <button className={ui.button} type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function SignOutButton() {
  const { router, pending, run } = useSubmit();
  return (
    <button
      className={`${ui.button} ${ui.secondary}`}
      type="button"
      disabled={pending}
      onClick={() =>
        void run(
          () => callApi('POST', '/auth/sign-out', {}),
          () => router.push('/sign-in'),
        )
      }
    >
      Sign out
    </button>
  );
}

export interface OrgOption {
  readonly membershipId: string;
  readonly orgId: string;
  readonly orgName: string;
}

export function OrgSwitcher({
  memberships,
  activeOrgId,
}: {
  memberships: readonly OrgOption[];
  activeOrgId: string | null;
}) {
  const { pending, error, run } = useSubmit();
  if (memberships.length === 0) return <span className={ui.muted}>No organization</span>;
  return (
    <label className={ui.row}>
      <span className={ui.muted}>Organization</span>
      <select
        className={ui.select}
        aria-label="Active organization"
        value={memberships.find((m) => m.orgId === activeOrgId)?.membershipId ?? ''}
        disabled={pending}
        onChange={(e) =>
          void run(() =>
            callApi('POST', '/v1/session/active-org', { membershipId: e.target.value }),
          )
        }
      >
        {activeOrgId === null && <option value="">Choose…</option>}
        {memberships.map((m) => (
          <option key={m.membershipId} value={m.membershipId}>
            {m.orgName}
          </option>
        ))}
      </select>
      <ErrorLine error={error} />
    </label>
  );
}

export function InviteForm({ roles }: { roles: readonly string[] }) {
  const { pending, error, run } = useSubmit();
  const [link, setLink] = useState<string | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const role = String(new FormData(e.currentTarget).get('role') ?? '');
    setLink(null);
    void run(
      () => callApi('POST', '/v1/invitations', { role }),
      (data) => {
        const token = (data as { token?: unknown }).token;
        if (typeof token === 'string') {
          setLink(`${window.location.origin}/invite/${encodeURIComponent(token)}`);
        }
      },
    );
  };
  return (
    <form className={ui.stack} onSubmit={onSubmit}>
      <div className={ui.row}>
        <label className={ui.label}>
          Role
          <select className={ui.select} name="role" defaultValue={roles.at(-1)}>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button className={ui.button} type="submit" disabled={pending}>
          Create invitation link
        </button>
      </div>
      <ErrorLine error={error} />
      {link && (
        <div className={ui.stack}>
          <p className={ui.muted}>
            Shown once. Anyone with this link can join with that role until it expires.
          </p>
          <code className={ui.code}>{link}</code>
        </div>
      )}
    </form>
  );
}

export function MemberControls({
  membershipId,
  role,
  roles,
}: {
  membershipId: string;
  role: string;
  roles: readonly string[];
}) {
  const { pending, error, run } = useSubmit();
  const path = `/v1/members/${encodeURIComponent(membershipId)}`;
  return (
    <div className={ui.row}>
      <select
        className={ui.select}
        aria-label="Role"
        value={role}
        disabled={pending}
        onChange={(e) => void run(() => callApi('PATCH', path, { role: e.target.value }))}
      >
        {roles.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <button
        className={`${ui.button} ${ui.danger}`}
        type="button"
        disabled={pending}
        onClick={() => void run(() => callApi('DELETE', path))}
      >
        Remove
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

export function AcceptInvitation({ token }: { token: string }) {
  const { router, pending, error, run } = useSubmit();
  return (
    <div className={ui.stack}>
      <button
        className={ui.button}
        type="button"
        disabled={pending}
        onClick={() =>
          void run(
            () => callApi('POST', '/v1/invitations/accept', { token }),
            () => router.push('/teams'),
          )
        }
      >
        Accept invitation
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** One-field create form posting `{ [field]: value }` (plus `extra`) to `path`. */
export function CreateForm({
  path,
  label,
  button,
  field = 'name',
}: {
  path: string;
  label: string;
  button: string;
  field?: string;
}) {
  const { pending, error, run } = useSubmit();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get('value') ?? '');
    void run(
      () => callApi('POST', path, { [field]: value }),
      () => form.reset(),
    );
  };
  return (
    <form className={ui.row} onSubmit={onSubmit}>
      <label className={ui.label}>
        {label}
        <input className={ui.input} name="value" maxLength={200} required />
      </label>
      <button className={ui.button} type="submit" disabled={pending}>
        {button}
      </button>
      <ErrorLine error={error} />
    </form>
  );
}

/** Status select and delete button for one task. Every change is re-checked by the action. */
export function TaskControls({
  projectId,
  id,
  status,
  canUpdate,
  canDelete,
}: {
  projectId: string;
  id: string;
  status: string;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { pending, error, run } = useSubmit();
  const path = `/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(id)}`;
  return (
    <div className={ui.row}>
      {canUpdate ? (
        <select
          className={ui.select}
          aria-label="Task status"
          value={status}
          disabled={pending}
          onChange={(e) => void run(() => callApi('PATCH', path, { status: e.target.value }))}
        >
          {['todo', 'doing', 'done'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      ) : (
        <span className={ui.muted}>{status}</span>
      )}
      {canDelete && (
        <button
          className={`${ui.button} ${ui.danger}`}
          type="button"
          disabled={pending}
          onClick={() => void run(() => callApi('DELETE', path))}
        >
          Delete
        </button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}
