'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui';
import { postJson } from './browser-api';
import styles from './shell.module.css';

export interface UserMenuProps {
  readonly name: string;
  readonly email: string;
}

/** Signed-in user and sign-out (Better Auth `POST /auth/sign-out` on the Engine). */
export function UserMenu({ name, email }: UserMenuProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setPending(true);
    setError(null);
    const r = await postJson('/auth/sign-out', {});
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.replace('/sign-in');
    router.refresh();
  };

  return (
    <div className={styles.menu}>
      <span className={styles.user}>
        <span className={styles.userName}>{name === '' ? email : name}</span>
        {name !== '' && <span className={styles.muted}>{email}</span>}
      </span>
      <Button size="sm" variant="ghost" busy={pending} onClick={() => void signOut()}>
        Sign out
      </Button>
      {error !== null && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
