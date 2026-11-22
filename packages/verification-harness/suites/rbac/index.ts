import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Finding, TenantContract } from '@lathe/shared-contracts';
import type { Gate, GateContext } from '../../src/gate.js';
import { checkDenyByDefault, type SourceFile } from './deny-by-default.js';
import { runRbacMatrix } from './matrix.js';

export {
  checkDenyByDefault,
  scanSource,
  isRouteFile,
  FOUNDATION_PACKAGE,
  WRAPPERS,
  type DenyByDefaultResult,
  type SourceFile,
} from './deny-by-default.js';
export { runRbacMatrix, type RbacMatrixOptions, type RbacMatrixResult } from './matrix.js';

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
const NOT_SOURCE = /(\.test\.|\.spec\.|\.d\.ts$)/;

/** Read the source files of an app directory (tests, declarations and build output excluded). */
export async function readAppSources(appDir: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && entry.name !== '__tests__') await walk(full);
      } else if (SOURCE.test(entry.name) && !NOT_SOURCE.test(entry.name)) {
        out.push({
          path: relative(appDir, full).split(sep).join('/'),
          text: await readFile(full, 'utf8'),
        });
      }
    }
  };
  await walk(appDir);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** What the gate needs from the app under test. Starting the app is the Engine's job (task P2-08). */
export interface RbacTarget {
  readonly contract: TenantContract;
  readonly baseUrl: string;
  readonly password: string;
  readonly runId: string;
  /** Directory holding the app's source, for the deny-by-default scan. */
  readonly appDir: string;
}

/**
 * The RBAC gate: deny-by-default scan first (static, no app needed), then the roles × actions matrix.
 * `resolve` supplies the app; if it throws the gate reports `error` and can never pass. It is not in
 * the default registry until an app launcher exists.
 */
export function rbacGate(resolve: (ctx: GateContext) => Promise<RbacTarget>): Gate {
  return {
    id: 'rbac',
    async run(ctx) {
      let target: RbacTarget;
      let sources: SourceFile[];
      try {
        target = await resolve(ctx);
        sources = await readAppSources(target.appDir);
      } catch (cause) {
        return {
          status: 'error',
          summary:
            `rbac could not reach the app: ${cause instanceof Error ? cause.message : 'unknown error'}`.slice(
              0,
              500,
            ),
          findings: [],
          artifacts: [],
        };
      }
      const scan = checkDenyByDefault(sources);
      const matrix = await runRbacMatrix(target);
      const findings: Finding[] = [...scan.findings, ...matrix.findings];
      return {
        status: findings.length > 0 ? 'failed' : 'passed',
        summary:
          `${scan.exports} handler exports in ${scan.handlerFiles} files, ` +
          `${matrix.pairs} role/action pairs, ${matrix.checks} checks, ${findings.length} findings`,
        findings,
        artifacts: [],
      };
    },
  };
}
