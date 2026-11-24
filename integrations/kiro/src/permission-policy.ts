import { posix } from 'node:path';
import type { SessionRequest } from '@lathe/shared-contracts';
import type { PermissionParams } from './acp-schemas.js';

export type PermissionPolicy = NonNullable<SessionRequest['permissionPolicy']>;

export interface PermissionDecision {
  allowed: boolean;
  /** Policy-terms reason, at most 500 characters. */
  reason: string;
}

const READ_ONLY_KINDS = new Set(['read', 'search', 'think']);
const WRITE_KINDS = new Set(['edit', 'delete', 'move']);

function isUnder(path: string, root: string): boolean {
  if (!path.startsWith('/')) return false;
  const p = posix.normalize(path);
  const r = posix.normalize(root);
  return p === r || p.startsWith(r.endsWith('/') ? r : r + '/');
}

/**
 * Decides one `session/request_permission`. Deny by default: no policy, an unknown
 * tool kind, a write without a location, or a write outside the allowed paths all reject.
 */
export function decidePermission(
  policy: PermissionPolicy | undefined,
  toolCall: PermissionParams['toolCall'],
): PermissionDecision {
  if (!policy) return { allowed: false, reason: 'no permission policy: reject all' };
  const kind = toolCall.kind ?? 'other';
  if (READ_ONLY_KINDS.has(kind)) return { allowed: true, reason: `${kind} allowed` };
  if (kind === 'execute')
    return policy.allowCommands
      ? { allowed: true, reason: 'commands allowed by policy' }
      : { allowed: false, reason: 'commands not allowed by policy' };
  if (WRITE_KINDS.has(kind)) {
    const paths = toolCall.locations?.map((l) => l.path) ?? [];
    if (paths.length === 0) return { allowed: false, reason: `${kind} without a location` };
    const outside = paths.find((p) => !policy.allowWritesUnder.some((root) => isUnder(p, root)));
    if (outside !== undefined)
      return { allowed: false, reason: `${kind} outside allowed paths`.slice(0, 500) };
    return { allowed: true, reason: `${kind} under allowed paths` };
  }
  return { allowed: false, reason: `tool kind ${kind.slice(0, 50)} not allowed` };
}
