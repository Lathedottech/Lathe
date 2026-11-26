import type { TenantContract } from '@lathe/shared-contracts';
import type { Gate, GateContext } from '../../src/gate.js';
import { runTenantIsolation } from './run.js';

export {
  runTenantIsolation,
  type TenantIsolationOptions,
  type TenantIsolationResult,
} from './run.js';

/** What the gate needs from a running app. Starting the app is the Engine's job (task P2-08). */
export interface IsolationTarget {
  readonly contract: TenantContract;
  readonly baseUrl: string;
  readonly password: string;
  readonly runId: string;
}

/**
 * The tenant-isolation gate. `resolve` supplies the app under test; if it throws, the gate
 * reports `error` and can never pass. It is not in the default registry until an app launcher exists.
 */
export function tenantIsolationGate(resolve: (ctx: GateContext) => Promise<IsolationTarget>): Gate {
  return {
    id: 'tenant-isolation',
    async run(ctx) {
      let target: IsolationTarget;
      try {
        target = await resolve(ctx);
      } catch (cause) {
        return {
          status: 'error',
          summary:
            `tenant-isolation could not reach the app: ${cause instanceof Error ? cause.message : 'unknown error'}`.slice(
              0,
              500,
            ),
          findings: [],
          artifacts: [],
        };
      }
      const r = await runTenantIsolation(target);
      const failed = r.findings.length > 0;
      return {
        status: failed ? 'failed' : 'passed',
        summary: `${r.checks} isolation checks, ${r.findings.length} findings`,
        findings: r.findings,
        artifacts: [],
      };
    },
  };
}
