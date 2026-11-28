'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from '../../components/shell/browser-api';
import { Button, TextField } from '../../components/ui';
import styles from './sign-in.module.css';

/** Better Auth email sign-in on the Engine (`POST /auth/sign-in/email`, proxied same-origin). */
export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await postJson('/auth/sign-in/email', {
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
    });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.replace('/projects');
    router.refresh();
  };

  return (
    <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error !== null && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" busy={pending}>
        Sign in
      </Button>
    </form>
  );
}
