# P0-05 report: dev-time Kiro setup (architect)

## 1. Objective completed

P0-05, partially completed. Hooks and per-phase specs exist. The acceptance item "hooks fire in Kiro IDE; steering loaded" was not checked (manual step, not run). Steering files already existed on main and were not changed.

## 2. Files created or modified

- `.kiro/hooks/check-package-on-save.kiro.hook` (v2): on save of `packages/**/src/**/*.ts`, `services/**/src/**/*.ts` or `integrations/**/src/**/*.ts`, asks the agent to run `pnpm --filter <package-name> typecheck` and, from the repo root, `pnpm exec vitest run --project <package-name>`. No package has a `test` script; tests run as root Vitest projects named after the package (for example `@lathe/shared-contracts`). The pattern was narrowed from every `.ts`/`.tsx` file so the agent turn does not fire on tests, config, or app UI saves. Apps and templates were dropped from the pattern for the same reason. Rejected: `userTriggered`, because nobody would remember to run it.
- `.kiro/hooks/warn-protected-paths.kiro.hook` (v2): on edit under `packages/verification-harness/**`, `.github/**`, `.kiro/hooks/**` or contracts C1-C4 (`packages/shared-contracts/src/{tenant-contract,kiro-adapter,gates,api}.ts`), asks the agent to stop and confirm ownership. This hook is advisory only (an agent prompt). Enforcement is CODEOWNERS plus the Engine's protected-path gate.
- `.kiro/specs/p1-skeleton`, `p2-verification-harness`, `p3-factory-engine-core`, `p4-kiro-sandbox`, `p5-build-verify-repair`, `p6-support-desk`, `p7-team-operations`, `p8-github-delivery`, `p9-workspace-ux`, `p10-deploy-submit`: one `requirements.md` each. Status line uses the status vocabulary (Existing, Partial, Missing, Proposed) per phase, with `TASKLIST.md` as the source of truth. Each points to its `TASKLIST.md` task range.
- Fix to the cancelled run's output: all ten specs had a corrupted reference to `tasks.md` (a `\t` had become a tab character). Repaired to `` `tasks.md` ``.

`.kiro/hooks/**` is owned by `devops` (`docs/agents/team.md` §3). These two hooks were written by `architect` and need A's approval before merge.

## 3. Technical decisions

- Hooks use `askAgent`, not a shell command. Rejected: `runCommand` hooks, which would execute without agent judgment and could be edited into running anything. The hooks do not commit, push, or use MCP, and contain no secrets.
- Specs hold only `requirements.md`, with a note that `design.md` and `tasks.md` are written when the phase starts. Rejected: writing full designs now, which would describe unbuilt work.

## 4. Tests executed

- `pnpm install --frozen-lockfile`
- `pnpm exec prettier --check .kiro docs`
- `pnpm lint`

## 5. Test results

- install (`pnpm install --frozen-lockfile`): exit 0.
- prettier: exit 0, "All matched files use Prettier code style!".
- lint: exit 0, "no dependency violations found (374 modules, 1087 dependencies cruised)".
- hook JSON: both files parse with `JSON.parse` (exit 0).

## 6. Remaining issues

- Checks were re-run on the merged head `77dd7a2` (origin/main merged into the task branch, no conflicts) and are in section 5.
- Hooks were not exercised in Kiro IDE.
- The hook JSON parses, but was not validated against a Kiro schema.
- `.kiro/hooks/**` needs devops ownership and A's approval.

- Manual IDE check: pending B (below).

## Manual IDE check (pending B, path owner of `.kiro/hooks/**`)

1. Open the repo in Kiro IDE and confirm both hooks are listed and enabled in the Agent Hooks panel.
2. Edit and save `packages/shared-contracts/src/index.ts` (add and remove a blank line). Expected: the check-package hook fires and the agent runs `pnpm --filter @lathe/shared-contracts typecheck` and `pnpm exec vitest run --project @lathe/shared-contracts`. Paste what fired and the result.
3. Edit and save any file under `packages/verification-harness/`. Expected: the warning hook fires (the check hook also fires if the file is under `src/`). Paste what fired. Revert the edit.
4. Save `packages/shared-contracts/src/api.ts` unchanged in content. Expected: the warning hook fires. Paste it.
5. Record the Kiro IDE version.

## 7. Dependencies or blockers

Merge of `origin/main` (needs a human or an allowed action).

## 8. Recommended next task

P0-10 (import-boundary enforcement) or P2-01, per "Next dependency-ready tasks" in `TASKLIST.md`.
