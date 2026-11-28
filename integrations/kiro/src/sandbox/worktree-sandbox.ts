import type { MountSource, SandboxCreateInput, SandboxSpec } from '@lathe/shared-contracts';
import type { Worktree } from './worktree.js';

/** The two `DockerSandboxOptions` callbacks a `Worktree` supplies. */
export interface WorktreeSandboxResolvers {
  resolveHostMounts(
    spec: SandboxSpec,
    input: SandboxCreateInput,
  ): Promise<Readonly<Partial<Record<MountSource, string>>>>;
  resolveGitDir(input: SandboxCreateInput): Promise<string>;
  /** Removes the trusted git dir created by `resolveGitDir`. Call after the sandbox is destroyed. */
  dispose(): Promise<void>;
}

/**
 * Adapts a `Worktree` to `DockerSandboxOptions`. `resolveHostMounts` returns the worktree's app and
 * foundation directories (the session volume is added by the caller). `resolveGitDir` returns the
 * trusted git dir whose root tree is the app tree at the base commit, outside every mounted path.
 * It refuses an input that does not match the worktree.
 */
export function worktreeSandboxResolvers(
  wt: Worktree,
  sessionVolume?: string,
): WorktreeSandboxResolvers {
  const disposers: Array<() => Promise<void>> = [];
  const check = (input: SandboxCreateInput): void => {
    if (`apps/${input.targetApp}` !== wt.appPath)
      throw new Error(`worktree is for ${wt.appPath}, not apps/${input.targetApp}`);
  };
  return {
    resolveHostMounts: () =>
      Promise.resolve({
        ...wt.hostMounts(),
        ...(sessionVolume === undefined ? {} : { 'kiro-session': sessionVolume }),
      }),
    resolveGitDir: async (input) => {
      check(input);
      const t = await wt.trustedGitDir();
      disposers.push(t.dispose);
      return t.gitDir;
    },
    dispose: async () => {
      for (const d of disposers.splice(0)) await d();
    },
  };
}
