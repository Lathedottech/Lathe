import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Me } from '@lathe/shared-contracts';
import { engineGet, type EngineContext, type EngineFailure } from './engine';

/**
 * Engine access from Server Components. Reads `LATHE_ENGINE_URL` and forwards the
 * incoming request's cookie. Never import this from a Client Component.
 */
export async function engineContext(): Promise<EngineContext> {
  const incoming = await headers();
  return {
    baseUrl: process.env['LATHE_ENGINE_URL'],
    cookie: incoming.get('cookie') ?? undefined,
  };
}

export type SessionResult =
  | { readonly ok: true; readonly me: Me }
  | { readonly ok: false; readonly failure: Exclude<EngineFailure, { kind: 'unauthenticated' }> };

/**
 * The signed-in user, read from `GET /v1/me` once per request (React `cache`).
 * No session redirects to sign-in. Any other failure, including a response that
 * does not match C4, returns a failure: the caller renders an error and no shell.
 */
export const requireSession = cache(async (): Promise<SessionResult> => {
  const result = await engineGet(await engineContext(), 'getMe');
  if (result.ok) return { ok: true, me: result.data };
  if (result.kind === 'unauthenticated') redirect('/sign-in');
  return { ok: false, failure: result };
});
