/**
 * Deny-by-default check (task P2-05): every route and server action of an app must be created with
 * `defineAction` (or `defineUserAction`) imported from `@lathe/application-foundation`.
 *
 * Approach: a strict pattern scan, not a full parser. Comments are removed and string contents are
 * blanked first, so a comment or a string cannot fake a wrapper. Then every export of a handler
 * file must be an initializer that is exactly one `defineAction(...)` call (optionally reached
 * through one or more local `const` aliases). Anything the scan cannot prove is reported, so it errs
 * toward failing.
 *
 * Handler files:
 *   - route files: `route.{ts,tsx,js,jsx,mjs}` (Next.js app router) and files under `pages/api/`;
 *   - server action files: files whose first statement is the `'use server'` directive.
 *
 * Known limits (the matrix suite covers behavior; this scan covers shape):
 *   - regex literals containing quotes or comment markers can confuse the sanitizer;
 *   - a handler that is wrapped but registered through a dynamic mechanism (`require`, computed
 *     export names) is not seen; `export * from` and `export { x } from` are reported as unverifiable;
 *   - inline `'use server'` inside a function body is reported, not analyzed;
 *   - files that are neither route files nor `'use server'` files are not scanned, so a handler
 *     can only escape by living outside both, where Next.js cannot serve it as a route or action.
 */
import type { Finding } from '@lathe/shared-contracts';

export const WRAPPERS = ['defineAction', 'defineUserAction'] as const;
export const FOUNDATION_PACKAGE = '@lathe/application-foundation';

/** Config exports Next.js reads from route files. They are not handlers. */
const ROUTE_CONFIG_EXPORTS = new Set([
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
]);

export interface SourceFile {
  /** Repo-relative or app-relative path with forward slashes. */
  readonly path: string;
  readonly text: string;
}

export interface DenyByDefaultResult {
  readonly findings: readonly Finding[];
  /** Handler files examined. Zero means nothing was checked. */
  readonly handlerFiles: number;
  /** Individual exports examined. */
  readonly exports: number;
}

export const isRouteFile = (path: string): boolean =>
  /(^|\/)route\.(ts|tsx|js|jsx|mjs)$/.test(path) ||
  /(^|\/)pages\/api\/.+\.(ts|tsx|js|jsx|mjs)$/.test(path);

/** Remove comments, keeping strings. Offsets and newlines are preserved. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (c === '/' && n === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      out += c;
      i += 1;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') {
          out += src[i] as string;
          i += 1;
        }
        out += src[i] ?? '';
        i += 1;
      }
      out += c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out.slice(0, src.length);
}

/** Blank the contents of string literals in comment-free text. Offsets are preserved. */
function blankStrings(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i += 1;
      while (i < src.length && src[i] !== c) {
        const step = src[i] === '\\' ? 2 : 1;
        out += src.slice(i, i + step).replace(/[^\n]/g, ' ');
        i += step;
      }
      out += c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out.slice(0, src.length);
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Index of the `)` matching the `(` at `open`, or -1. Strings are already blank. */
function matchParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const WRAPPER_CALL = new RegExp(`^\\s*(${WRAPPERS.join('|')})\\s*(?:<[^()]*>)?\\s*\\(`);

/** True when `init` is exactly one wrapper call and nothing else on that statement. */
function isWrapperCall(init: string): boolean {
  const m = WRAPPER_CALL.exec(init);
  if (!m) return false;
  const open = m[0].length - 1;
  const close = matchParen(init, open);
  if (close === -1) return false;
  const rest = init.slice(close + 1);
  // Only a terminator may follow on the same statement: `;`, a newline, or the end.
  return /^[ \t]*(;|\r?\n|$)/.test(rest);
}

interface Violation {
  readonly ruleId: string;
  readonly message: string;
  readonly line: number;
}

/** Scan one file. Returns its violations and how many exports it checked. */
export function scanSource(file: SourceFile): {
  violations: Violation[];
  exports: number;
  handler: boolean;
} {
  const noComments = stripComments(file.text);
  const useServer = /(['"])use server\1/g;
  const directives = [...noComments.matchAll(useServer)];
  const fileLevel =
    directives.length > 0 && /^\s*(['"])use server\1/.test(noComments) ? directives[0] : undefined;
  const route = isRouteFile(file.path);
  const violations: Violation[] = [];
  const v = (ruleId: string, message: string, index: number): void => {
    violations.push({ ruleId, message, line: lineOf(noComments, index) });
  };
  for (const d of directives)
    if (d !== fileLevel)
      v(
        'rbac/inline-server-action',
        "an inline 'use server' action cannot be verified; move it to a 'use server' file",
        d.index,
      );
  if (!route && !fileLevel) return { violations, exports: 0, handler: false };

  const text = blankStrings(noComments);

  // How defineAction is bound in this file.
  const imported = new Set<string>();
  for (const m of noComments.matchAll(/import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g)) {
    const names = (m[1] ?? '').split(',').map((s) => s.trim());
    for (const name of names) {
      if (!(WRAPPERS as readonly string[]).includes(name)) continue;
      if (m[3] === FOUNDATION_PACKAGE) imported.add(name);
      else
        v(
          'rbac/foreign-defineaction',
          `${name} is imported from ${m[3] ?? '?'}, not from ${FOUNDATION_PACKAGE}`,
          m.index,
        );
    }
  }
  for (const m of text.matchAll(
    /\b(?:function|const|let|var|class)\s+(defineAction|defineUserAction)\b/g,
  ))
    v('rbac/shadowed-defineaction', `${m[1] ?? 'defineAction'} is declared locally`, m.index);
  const wrapperBound = imported.size > 0;

  // Local `const name = <init>` declarations, for alias resolution.
  const decls = new Map<string, string>();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=(?!=)/g)) {
    const start = (m.index ?? 0) + m[0].length;
    if (!decls.has(m[1] ?? '')) decls.set(m[1] ?? '', text.slice(start));
  }

  const wrapped = (init: string, depth = 0): boolean => {
    if (isWrapperCall(init)) return wrapperBound;
    const id = /^\s*([A-Za-z_$][\w$]*)\s*(;|\r?\n|$)/.exec(init)?.[1];
    if (id && depth < 5) {
      const target = decls.get(id);
      return target !== undefined && wrapped(target, depth + 1);
    }
    return false;
  };

  let exportsChecked = 0;
  const check = (name: string, init: string | undefined, index: number): void => {
    if (route && ROUTE_CONFIG_EXPORTS.has(name)) return;
    exportsChecked += 1;
    if (init === undefined || !wrapped(init))
      v(
        'rbac/unwrapped-route',
        `export ${name} is not created with defineAction, so it has no permission check`,
        index,
      );
  };

  for (const m of text.matchAll(
    /\bexport\s+(?:async\s+)?(?:function\s*\*?|class)\s*([A-Za-z_$][\w$]*)?/g,
  ))
    check(m[1] ?? 'default', undefined, m.index ?? 0);
  for (const m of text.matchAll(
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=(?!=)/g,
  ))
    check(m[1] ?? '?', text.slice((m.index ?? 0) + m[0].length), m.index ?? 0);
  for (const m of text.matchAll(/\bexport\s+default\s+(?!(?:async\s+)?function\b|class\b)/g))
    check('default', text.slice((m.index ?? 0) + m[0].length), m.index ?? 0);
  for (const m of text.matchAll(/\bexport\s+default\s+(?:async\s+)?(?:function|class)\b/g))
    check('default', undefined, m.index ?? 0);
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}\s*(from\b)?/g)) {
    if (m[2]) {
      v(
        'rbac/unverifiable-export',
        're-exports cannot be verified; define the handler here',
        m.index ?? 0,
      );
      exportsChecked += 1;
      continue;
    }
    for (const spec of (m[1] ?? '').split(',')) {
      const parts = spec.trim().split(/\s+as\s+/);
      const local = parts[0]?.trim();
      const exported = parts[1]?.trim() ?? local;
      if (!local || /^type\s/.test(local)) continue;
      check(exported ?? local, decls.get(local), m.index ?? 0);
    }
  }
  for (const m of text.matchAll(/\bexport\s*\*/g)) {
    v(
      'rbac/unverifiable-export',
      're-exports cannot be verified; define the handler here',
      m.index ?? 0,
    );
    exportsChecked += 1;
  }
  return { violations, exports: exportsChecked, handler: true };
}

/** Scan a set of source files (tests and declaration files already excluded by the caller). */
export function checkDenyByDefault(files: readonly SourceFile[]): DenyByDefaultResult {
  const findings: Finding[] = [];
  let handlerFiles = 0;
  let exportsChecked = 0;
  for (const file of files) {
    const r = scanSource(file);
    if (r.handler) handlerFiles += 1;
    exportsChecked += r.exports;
    for (const x of r.violations)
      findings.push({
        ruleId: x.ruleId,
        message: x.message,
        severity: 'critical',
        path: file.path,
        line: x.line,
      });
  }
  if (handlerFiles === 0)
    findings.push({
      ruleId: 'rbac/no-handler-files',
      message: 'no route or server action file found; a scan that checks nothing cannot pass',
      severity: 'critical',
    });
  return { findings, handlerFiles, exports: exportsChecked };
}
