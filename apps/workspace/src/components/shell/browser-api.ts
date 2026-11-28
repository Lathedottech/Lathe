/**
 * Browser-side POST to the Engine through the Workspace origin (`/v1/*` and `/auth/*`
 * are proxied to the Engine by `next.config.ts`). Same origin only, so the session
 * cookie and the `Origin` header go with every request.
 */
export type PostResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly requestId?: string };

export async function postJson(path: string, body: unknown): Promise<PostResult> {
  if (!path.startsWith('/v1/') && !path.startsWith('/auth/'))
    throw new Error(`postJson only calls Engine routes, not ${path}`);
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: 'The Factory Engine could not be reached.' };
  }
  if (res.ok) return { ok: true };
  let err: { message?: unknown; requestId?: unknown } = {};
  try {
    err = (await res.json()) as typeof err;
  } catch {
    // Not JSON (for example a proxy error page): fall back to the status below.
  }
  return {
    ok: false,
    message: typeof err.message === 'string' ? err.message : `Request failed (${res.status}).`,
    ...(typeof err.requestId === 'string' ? { requestId: err.requestId } : {}),
  };
}
