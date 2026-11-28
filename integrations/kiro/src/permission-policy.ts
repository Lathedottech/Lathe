import { posix } from 'node:path';
import { KIRO_SESSION_PATH, type SessionRequest } from '@lathe/shared-contracts';
import type { PermissionParams } from './acp-schemas.js';

export type PermissionPolicy = NonNullable<SessionRequest['permissionPolicy']>;

export interface PermissionDecision {
  allowed: boolean;
  /** Policy-terms reason, at most 500 characters. */
  reason: string;
}

const READ_KINDS = new Set(['read', 'search']);
const WRITE_KINDS = new Set(['edit', 'delete', 'move']);

/** Never readable or writable, whatever the policy says. */
const DENIED_ROOTS: readonly string[] = [KIRO_SESSION_PATH, '/proc', '/sys', '/dev', '/etc'];

/** rawInput fields that carry a path (matched case-insensitively). */
const PATH_KEYS = new Set(
  [
    'path',
    'file_path',
    'filePath',
    'destination',
    'target',
    'source',
    'from',
    'to',
    'newPath',
    'oldPath',
    'cwd',
    'directory',
    'uri',
    'url',
    'href',
  ].map((k) => k.toLowerCase()),
);
/** Keys whose string values hold commands, not paths, so the "looks absolute" scan skips them. */
const COMMAND_KEYS = new Set(['command', 'cmd', 'args', 'script']);
const MAX_WALK_NODES = 500;
const MAX_WALK_DEPTH = 8;

function normalizeAbs(path: string): string | undefined {
  if (!path.startsWith('/') || path.includes('\0')) return undefined;
  return posix.normalize(path).replace(/\/+$/, '') || '/';
}

/** Segment-wise prefix test: `/workspace/app2` is not under `/workspace/app`. */
function isUnder(path: string, root: string): boolean {
  const r = normalizeAbs(root);
  return r !== undefined && (path === r || path.startsWith(r === '/' ? '/' : r + '/'));
}

/** `file:///a/b` to `/a/b`. Undefined for a remote host, bad escapes or a NUL. */
function fileUriToPath(uri: string): string | undefined {
  const rest = uri.slice('file://'.length);
  if (!rest.startsWith('/')) return undefined; // a host part (file://host/...) cannot be checked
  try {
    const decoded = decodeURIComponent(rest);
    return decoded.includes('\0') ? undefined : decoded;
  } catch {
    return undefined;
  }
}

interface Collected {
  paths: string[];
  /** A path field held something that is not an absolute path, so it cannot be checked. */
  unresolvable: boolean;
}

/** Collects every path-like value of a tool call's rawInput. Bounded in depth and size. */
function collectRawPaths(raw: unknown, scanValues: boolean): Collected {
  const out: Collected = { paths: [], unresolvable: false };
  let nodes = 0;
  const visit = (value: unknown, key: string | undefined, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_WALK_NODES || depth > MAX_WALK_DEPTH) {
      out.unresolvable = true;
      return;
    }
    const keyed = key !== undefined && PATH_KEYS.has(key.toLowerCase());
    if (typeof value === 'string') {
      const commandish = key !== undefined && COMMAND_KEYS.has(key.toLowerCase());
      if (value.toLowerCase().startsWith('file://')) {
        const p = fileUriToPath(value);
        if (p === undefined) out.unresolvable = true;
        else out.paths.push(p);
      } else if (keyed || (scanValues && !commandish && value.startsWith('/'))) {
        if (value.startsWith('/')) out.paths.push(value);
        else out.unresolvable = true;
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, key, depth + 1);
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) visit(v, k, depth + 1);
    }
  };
  visit(raw, undefined, 0);
  return out;
}

type PathCheck = { ok: true } | { ok: false; why: string };

function checkPaths(paths: readonly string[], roots: readonly string[]): PathCheck {
  for (const p of paths) {
    const n = normalizeAbs(p);
    if (n === undefined) return { ok: false, why: 'path is not absolute' };
    if (DENIED_ROOTS.some((d) => isUnder(n, d)))
      return { ok: false, why: 'path is in a denied area' };
    if (!roots.some((r) => isUnder(n, r)))
      return { ok: false, why: 'path is outside allowed paths' };
  }
  return { ok: true };
}

/**
 * Commands are checked with an allow-list, not a deny-list. A command string is
 * accepted only when it has no shell syntax at all, starts with one of the entries
 * below, and every argument stays inside the allowed roots. Anything else is denied.
 * Allowed: `pnpm test|typecheck|lint|build`, `pnpm exec vitest|tsc|prettier|eslint`,
 * `vitest`, `tsc`, and `git status|diff` with a fixed flag set. Everything else is
 * denied: shells, `node`, `npx`, `env`, `printenv`, `set`, `export`, `cd`, `cat`.
 */
const SHELL_SYNTAX = /[;&|<>\u0060$(){}\\*?~!#\n\r\0]/;
const PNPM_SCRIPTS = new Set(['test', 'typecheck', 'lint', 'build']);
const PNPM_EXEC = new Set(['vitest', 'tsc', 'prettier', 'eslint']);
const GIT_FLAGS = new Set([
  '--stat',
  '--name-only',
  '--name-status',
  '--cached',
  '--staged',
  '--short',
  '-s',
  '--porcelain',
  '--shortstat',
  '--no-color',
]);
const FORBIDDEN_WORDS = new Set(['env', 'printenv', 'set', 'export', 'cd', 'sh', 'bash', 'eval']);

/** Splits on unquoted whitespace. Quotes group but never allow shell syntax. */
function tokenize(command: string): string[] | undefined {
  const tokens: string[] = [];
  let cur = '';
  let quote: string | undefined;
  let started = false;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = undefined;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === ' ' || ch === '\t') {
      if (started || cur) tokens.push(cur);
      cur = '';
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  if (quote) return undefined;
  if (started || cur) tokens.push(cur);
  return tokens;
}

function argumentStaysInside(arg: string, roots: readonly string[]): boolean {
  // --flag=value is checked on its value as well as on the whole argument.
  const parts = arg.includes('=') ? [arg, arg.slice(arg.indexOf('=') + 1)] : [arg];
  for (const part of parts) {
    if (part.includes('://') || part.includes('..')) return false;
    if (DENIED_ROOTS.some((d) => part.includes(d))) return false;
    if (part.startsWith('/')) {
      const n = normalizeAbs(part);
      if (n === undefined || !roots.some((r) => isUnder(n, r))) return false;
    }
  }
  return true;
}

function checkCommand(raw: unknown, roots: readonly string[]): PathCheck {
  const input = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const value = input['command'] ?? input['cmd'];
  let tokens: string[] | undefined;
  if (typeof value === 'string') {
    if (SHELL_SYNTAX.test(value)) return { ok: false, why: 'command uses shell syntax' };
    tokens = tokenize(value);
  } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    tokens = value as string[];
    if (tokens.some((t) => SHELL_SYNTAX.test(t)))
      return { ok: false, why: 'command uses shell syntax' };
  }
  if (tokens === undefined || tokens.length === 0)
    return { ok: false, why: 'command cannot be parsed' };
  if (tokens.some((t) => FORBIDDEN_WORDS.has(t)))
    return { ok: false, why: 'command uses a forbidden word' };
  const [bin, a, b] = tokens as [string, ...string[]];
  let args: string[];
  if (bin === 'pnpm' && a !== undefined && PNPM_SCRIPTS.has(a)) args = tokens.slice(2);
  else if (bin === 'pnpm' && a === 'exec' && b !== undefined && PNPM_EXEC.has(b))
    args = tokens.slice(3);
  else if (bin === 'vitest' || bin === 'tsc') args = tokens.slice(1);
  else if (bin === 'git' && (a === 'status' || a === 'diff')) {
    args = tokens.slice(2);
    for (const x of args) {
      if (x.startsWith('-') && !GIT_FLAGS.has(x)) return { ok: false, why: 'git flag not allowed' };
    }
  } else return { ok: false, why: 'command is not on the allow-list' };
  return args.every((x) => argumentStaysInside(x, roots))
    ? { ok: true }
    : { ok: false, why: 'command argument is outside allowed paths' };
}
/**
 * Decides one `session/request_permission`. Deny by default: no policy, an unknown
 * tool kind, an access without a path, or any path (in `locations` or anywhere in
 * `rawInput`) outside the allowed roots or inside a denied root all reject.
 *
 * `readRoots` are the container paths of the target app and application-foundation
 * mounts. When omitted, reads are limited to `policy.allowWritesUnder`.
 * Symlinks are not resolved here; the sandbox must not contain links that leave the
 * mounts (P4-02).
 */
export function decidePermission(
  policy: PermissionPolicy | undefined,
  toolCall: PermissionParams['toolCall'],
  readRoots?: readonly string[],
  options: { commandsEnabled?: boolean } = {},
): PermissionDecision {
  if (!policy) return { allowed: false, reason: 'no permission policy: reject all' };
  const kind = toolCall.kind ?? 'other';
  const isRead = READ_KINDS.has(kind);
  const isWrite = WRITE_KINDS.has(kind);
  const isThink = kind === 'think';
  const isExecute = kind === 'execute';
  if (!isRead && !isWrite && !isThink && !isExecute)
    return { allowed: false, reason: `tool kind ${kind.slice(0, 50)} not allowed` };
  if (isExecute && !(policy.allowCommands && options.commandsEnabled === true))
    return { allowed: false, reason: 'commands not allowed' };

  const located = toolCall.locations?.map((l) => l.path) ?? [];
  const raw = collectRawPaths(toolCall.rawInput, !isExecute);
  const paths = [...located, ...raw.paths];
  if (raw.unresolvable)
    return { allowed: false, reason: `${kind} names a path that cannot be checked` };
  if (isExecute) {
    const c = checkCommand(toolCall.rawInput, [...(readRoots ?? []), ...policy.allowWritesUnder]);
    if (!c.ok) return { allowed: false, reason: `execute: ${c.why}`.slice(0, 500) };
  }
  if (paths.length === 0) {
    if (isThink || isExecute) return { allowed: true, reason: `${kind} allowed` };
    return { allowed: false, reason: `${kind} without a location` };
  }
  const roots =
    isWrite || isExecute
      ? policy.allowWritesUnder
      : [...(readRoots ?? []), ...policy.allowWritesUnder];
  const result = checkPaths(paths, roots);
  if (!result.ok) return { allowed: false, reason: `${kind}: ${result.why}`.slice(0, 500) };
  return { allowed: true, reason: `${kind} under allowed paths` };
}
