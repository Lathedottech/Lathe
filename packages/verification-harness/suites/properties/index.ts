import type { Finding, TenantContract } from '@lathe/shared-contracts';
import type { Gate, GateContext } from '../../src/gate.js';
import { runProperties, type PendingInvariant } from './run.js';

export {
  runProperties,
  defaultSeed,
  PENDING_INVARIANTS,
  type PendingInvariant,
  type PropertiesOptions,
  type PropertiesResult,
} from './run.js';

/** What the gate needs from the app under test. Starting the app is the Engine's job (task P2-08). */
export interface PropertiesTarget {
  readonly contract: TenantContract;
  readonly baseUrl: string;
  readonly password: string;
  readonly runId: string;
  readonly numRuns?: number;
  readonly seed?: number;
}

const describePending = (pending: readonly PendingInvariant[]): string =>
  pending.length === 0
    ? ''
    : `, ${pending.length} pending (${pending.map((p) => p.id).join(', ')})`;

/**
 * The property gate. Pending invariants are listed in the summary and as `info` findings; they are
 * never counted as passing. If `resolve` throws the gate reports `error` and can never pass. It is
 * not in the default registry until an app launcher exists.
 */
export function propertiesGate(resolve: (ctx: GateContext) => Promise<PropertiesTarget>): Gate {
  return {
    id: 'properties',
    async run(ctx) {
      let target: PropertiesTarget;
      try {
        target = await resolve(ctx);
      } catch (cause) {
        return {
          status: 'error',
          summary:
            `properties could not reach the app: ${cause instanceof Error ? cause.message : 'unknown error'}`.slice(
              0,
              500,
            ),
          findings: [],
          artifacts: [],
        };
      }
      const r = await runProperties(target);
      const info: Finding[] = r.pending.map((p) => ({
        ruleId: `properties/pending-${p.id}`,
        message: `${p.id} is pending: ${p.reason}`,
        severity: 'info',
      }));
      const failing = r.findings.length > 0;
      return {
        status: failing ? 'failed' : 'passed',
        summary:
          `${r.runs} runs, ${r.checks} checks, seed ${r.seed}, ` +
          `${r.findings.length} findings${describePending(r.pending)}${r.path ? `, path ${r.path}` : ''}`.slice(
            0,
            400,
          ),
        findings: [...r.findings, ...info],
        artifacts: [],
      };
    },
  };
}
