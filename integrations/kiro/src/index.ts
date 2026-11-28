/**
 * @lathe/kiro-integration: ACP adapter for Kiro (task P4-01).
 * Sandbox runner (P4-02) and runtime agent configs (P4-04) are not part of this package yet.
 * The fake ACP server lives in `src/testing/` and is imported by tests only.
 */
export { AcpKiroAdapter, type AcpAdapterOptions, type SessionStats } from './adapter.js';
export { KiroAdapterError, KiroTimeoutError, type AdapterErrorCode } from './errors.js';
export {
  decidePermission,
  type PermissionDecision,
  type PermissionPolicy,
} from './permission-policy.js';
export {
  hostSpawn,
  type AcpProcess,
  type ExitInfo,
  type SpawnContext,
  type SpawnFn,
} from './process.js';
export { AgentConfig, installAgent, loadAgentConfig } from './agents/index.js';
