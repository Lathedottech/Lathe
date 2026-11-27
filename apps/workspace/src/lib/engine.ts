import { ApiError, ROUTES, type RouteName } from '@lathe/shared-contracts';
import type { z } from 'zod';
import { parseEngineUrl } from './engine-url';

/**
 * Server-side client of the Factory Engine HTTP API (contract C4).
 *
 * - Only routes declared in `ROUTES` can be called, with their declared method and path.
 * - Every response is validated with the route's C4 schema. A body that does not
 *   match is an error, never shown as data (deny by default).
 * - Only the caller's `cookie` header is forwarded. The Engine resolves the user and
 *   the active org from that session; the Workspace never sends an org id.
 */

type GetRoute = {
  [K in RouteName]: (typeof ROUTES)[K]['method'] extends 'GET'
    ? (typeof ROUTES)[K] extends { sse: true }
      ? never
      : K
    : never;
}[RouteName];

export type EngineData<K extends RouteName> = z.infer<(typeof ROUTES)[K]['response']>;

export type EngineFailure =
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden'; readonly message: string; readonly requestId?: string }
  | { readonly kind: 'not_found'; readonly message: string; readonly requestId?: string }
  | { readonly kind: 'error'; readonly message: string; readonly requestId?: string };

export type EngineResult<T> =
  { readonly ok: true; readonly data: T } | ({ readonly ok: false } & EngineFailure);

export interface EngineContext {
  /** `LATHE_ENGINE_URL`. Undefined or invalid means no call is made. */
  readonly baseUrl: string | undefined;
  /** The incoming request's `cookie` header, forwarded as is. */
  readonly cookie: string | undefined;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export { parseEngineUrl };

/** Fills `:param` segments. Each value is URI-encoded, so it cannot add a path segment. */
export function routePath(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === '') throw new Error(`missing route parameter ${name}`);
    return encodeURIComponent(value);
  });
}

function apiError(body: unknown): { message: string; requestId?: string } | null {
  const parsed = ApiError.safeParse(body);
  return parsed.success ? { message: parsed.data.message, requestId: parsed.data.requestId } : null;
}

export async function engineGet<K extends GetRoute>(
  ctx: EngineContext,
  name: K,
  params: Readonly<Record<string, string>> = {},
  query: Readonly<Record<string, string>> = {},
): Promise<EngineResult<EngineData<K>>> {
  const base = parseEngineUrl(ctx.baseUrl);
  if (base === null)
    return { ok: false, kind: 'error', message: 'The Factory Engine URL is not configured.' };

  const route = ROUTES[name];
  const url = new URL(routePath(route.path, params), base);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const headers: Record<string, string> = { accept: 'application/json' };
  if (ctx.cookie !== undefined && ctx.cookie !== '') headers['cookie'] = ctx.cookie;

  let res: Response;
  try {
    res = await (ctx.fetch ?? fetch)(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: 'error', message: 'The Factory Engine could not be reached.' };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  if (res.status === 200) {
    const parsed = (route.response as z.ZodType).safeParse(body);
    if (parsed.success) return { ok: true, data: parsed.data as EngineData<K> };
    return {
      ok: false,
      kind: 'error',
      message: 'The Factory Engine sent a response that does not match the API contract.',
    };
  }

  const err = apiError(body);
  if (res.status === 401) return { ok: false, kind: 'unauthenticated' };
  if (res.status === 403)
    return {
      ok: false,
      kind: 'forbidden',
      message: err?.message ?? "You don't have access.",
      ...(err?.requestId ? { requestId: err.requestId } : {}),
    };
  if (res.status === 404)
    return {
      ok: false,
      kind: 'not_found',
      message: err?.message ?? 'Not found.',
      ...(err?.requestId ? { requestId: err.requestId } : {}),
    };
  return {
    ok: false,
    kind: 'error',
    message: err?.message ?? `The Factory Engine answered with status ${res.status}.`,
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
}
