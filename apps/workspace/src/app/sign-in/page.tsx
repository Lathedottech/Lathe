import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';
import styles from './sign-in.module.css';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <main className={styles.page} id="main">
      <div className={styles.card}>
        <h1>Sign in to Lathe</h1>
        <p className={styles.lede}>Use the operator account your organization gave you.</p>
        <SignInForm />
      </div>
    </main>
  );
}
