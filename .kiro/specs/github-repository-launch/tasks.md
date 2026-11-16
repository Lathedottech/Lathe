# Implementation Plan: GitHub Repository Launch

## Overview

This plan turns the publishing pipeline in `design.md` (steps S0 to S13, gates G1 to G9, checks K0 to K32, Properties 1 to 18) into an ordered checklist. Each task is run by one agent role at a time, or by the Human_Operator.

Rules that apply to every task:

- **Human gates.** A task marked **HUMAN GATE** needs the Human_Operator to supply input, approve content, or perform the action. The agent stops and asks. It never assumes a value, and it never treats silence as approval.
- **Hard-to-reverse commands.** `git commit`, `gh repo create`, `gh repo edit`, `git remote add` and `git push` run only after the recorded confirmation named in the task, and only with the Human_Operator present. No force flag, no `--amend`, no `reset --hard`. Fixes go forward as new commits with a new approval (design conflict C1).
- **Nothing is Done without evidence.** A task is not done until its command, exit code and a redacted output excerpt (at most 20 lines) are recorded in the report draft `$env:TEMP\lathe-launch\report-draft.md` (fed by `$env:TEMP\lathe-launch\evidence.jsonl`). Reading code is not evidence. A command not run is recorded as "not run" with the reason.
- **Temp, not workspace.** Helper scripts, evidence, baseline, scanner binary, fresh clones and the property-check folder live under `$env:TEMP\lathe-launch\`, outside the workspace (design decisions, conflict C3). The report records each script's SHA-256. Nothing is added under `scripts/` and no `package.json` gets a dependency.
- **Ownership** (`docs/agents/team.md` section 3). Single writer per path: `README.md`, `CONTRIBUTING.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, `docs/assets/brand/*`, the launch report: `documentation`. `SECURITY.md`: `security`. `.github/**`, root `package.json`, `.gitignore`: `devops` (or the Human_Operator, Requirement 7.9). `.kiro/specs/**` and `docs/handoffs/**` for architect handoffs: `architect`. A role that does not own a path files `docs/handoffs/<from>-to-<owner>-<name>.md` and leaves the path unchanged.
- **Scope** (Requirement 10). Only paths on the R10.1 allow-list change. No `.github/workflows/`, release, tag, Pages, webhook, deploy key, branch protection, star, watch, fork or follow. The only remote settings are those in R10.3.
- **Order resolutions for conflicts C1 to C8.** C1: commits are created only after approval, then fresh-clone verification runs on the commits, and fixes are new commits with new approval. C3: baseline manifest is written to temp first and copied into the report at the end. C2: the push-state check (K29) runs right after the first push, the report is written and committed last, then K29 runs again. C4: spec files that contain path or email strings need per-line approval or an edit. C5: pre-commit checks run on the cumulative index. C6: link row targets are anchors and files. C7: the fresh clone uses the host Node, and the README states the `.nvmrc` value. C8: Quickstart commands run only in temp clones.

## Tasks

- [ ] 1. Phase 0: Evidence setup and baseline (S0)
  - [ ] 1.1 Create the temp working area and evidence recorder
    - Create `$env:TEMP\lathe-launch\` with `evidence.ps1` (wrapper that runs a command, captures exit code, redacts, caps the excerpt at 20 lines, appends one JSON line to `evidence.jsonl`), an empty `report-draft.md`, and `decisions.jsonl` for approval records (decision, value, approver, date, boundHash).
    - Record tool versions: `git --version`, `gh --version`, `gh auth status` (no token in output), `node --version`, `pnpm --version`.
    - Record K1 before any git configuration change: `git config --global --list; $LASTEXITCODE` and `git config --system --list; $LASTEXITCODE`, saved as the "before" snapshot. Do not touch `core.autocrlf`.
    - Creates only files under `$env:TEMP\lathe-launch\`. Writes nothing in the workspace.
    - _Requirements: 2.2, 10.7_
    - _Design: Evidence recorder, K1_
  - [ ] 1.2 Record the baseline manifest before any workspace change
    - Run `git -c core.quotepath=false ls-files --others --cached --exclude-standard`, then `git hash-object -w -- <path>` for each path. Write `baseline.tsv` as `blobId<TAB>path`, sorted by path, with the header line from the design.
    - Confirm `git log` shows zero commits and `git remote -v` shows no remote.
    - Evidence: command, exit code, line count, SHA-256 of `baseline.tsv`.
    - _Requirements: 10.7, 2.7, 3.9_
    - _Design: K0, conflict C3_

- [ ] 2. Phase 1: Collect decisions and inputs (S1, G1)
  - [ ] 2.1 **HUMAN GATE G1**: ask the Human_Operator for every input and decision
    - Stop and ask. Do not propose-and-proceed. Offer the design's proposed values only as suggestions. Record each answer in `decisions.jsonl` with approver, date and the SHA-256 of the answer text.
    - Inputs: git author name and email (or the noreply address with the numeric account ID); copyright holder; repository name (proposed `lathe`); description (proposed text in R3.4); Topic_List (proposed list in R3.6); tagline (at most 100 characters, proposed in the design); conduct contact method; website URL (none while empty).
    - Decisions: loop wording option (a), (b) or (c), with the README text each option produces (R6.1); `comments.json` (commit, delete, or add to `.gitignore`); approval to download a pinned gitleaks release into temp, or the labeled regex fallback, or another tool; approval to install `fast-check` in the temp self-test folder (or example-based tests only); executor model; commit split; logo display width; confirmation of conflicts C1 to C8 (in particular C4 per-line approval for the spec files, and C6 link row targets).
    - File input: the Human_Operator saves the logo at `docs/assets/brand/lathe-logo.png`. If it is missing or not a PNG, stop and ask again (R8.1). Do not create or substitute a logo.
    - If loop option (c) is chosen, record that the handoff `docs/handoffs/<from>-to-architect-workflow-wording.md` must be filed in task 6.8 before the loop section is written, and that `.kiro/steering/product.md` stays unchanged.
    - Record the loop selection (option letter, name, date) for the report (R6.7).
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.4, 3.6, 3.11, 4.1, 4.2, 6.1, 6.7, 7.1, 7.2, 1.10, 8.1, 8.6_
    - _Design: Inputs collected at G1, Open Decisions_
  - [ ] 2.2 Validate the supplied inputs
    - Write `validators.ps1` in the temp folder and run it against the answers: name and holder 1 to 100 characters; email has exactly one `@` with text on both sides; repository name 1 to 100 of letters, digits, `-`, `_`, `.`; description 1 to 350 Unicode characters; Topic_List 1 to 20 unique topics matching `[a-z0-9][a-z0-9-]{0,49}`; tagline at most 100 characters.
    - Any invalid or missing value: stop, report which one, and ask again. The Local_Repository stays at zero commits.
    - Evidence: validator command, exit code, pass or fail per input.
    - _Requirements: 2.3, 2.4, 3.1, 3.4, 3.7, 4.2, 5.1_
    - _Design: K6_
  - [ ]* 2.3 Write property test for input validators
    - **Property 6: Operator input validators**
    - **Validates: Requirements 2.3, 2.4, 3.1, 3.4, 3.7, 4.2**
    - Place it in `$env:TEMP\lathe-launch\selftest\` (fast-check if approved at 2.1, otherwise example-based). Tag: `Feature: github-repository-launch, Property 6`.

- [ ] 3. Checkpoint: inputs collected
  - Confirm `decisions.jsonl` has every G1 item with approver, date and hash, and 2.2 passed. Stop and ask the Human_Operator if any item is missing. Ensure all checks pass, ask the user if questions arise.

- [ ] 4. Phase 2: Preflight (S2)
  - [ ] 4.1 **HUMAN GATE**: install or confirm the secret scanner
    - Only after the Human_Operator approved the pinned download at 2.1: download the gitleaks release from the official GitHub releases page into `$env:TEMP\lathe-launch\tools\`, compare its SHA-256 with the published checksums file, record the version. Do not add it to PATH or to the repository.
    - Write the scanner config (`useDefault = true`, allowlist `node_modules/` and `.git/`) in the temp folder.
    - If the Human_Operator declined, use only the option they chose and record it as "weaker, accepted by <name> on <date>". If no scanner is available, stop (R1.4).
    - Check the subcommands `dir`, `git --staged` and `git` exist in the pinned version, and record the command that works.
    - _Requirements: 1.1, 1.4_
    - _Design: Secret scanner choice_
  - [ ] 4.2 Run the working-tree preflight checks
    - K2: scan the working tree with `--redact`, leak exit code 2, JSON report to temp. Record command, exit code, finding count. Scope includes `pnpm-lock.yaml` and all of `docs/`.
    - K3: `git check-ignore -v .kiro`, `git check-ignore -v .kiro/agents/x`, and `Select-String -Path .gitignore -Pattern '^\s*!?/?\.kiro' -n`. Any hit: stop and report pattern and line (R1.9).
    - K4: read the first 24 bytes of `docs/assets/brand/lathe-logo.png` and confirm the PNG signature and width and height at least 1.
    - K5: `Test-Path comments.json`, and confirm the decision from 2.1 exists.
    - Any finding or tool error: stop, report path, line number and rule name only (never the matched value), notify the `security` role, and leave the tree untouched.
    - _Requirements: 1.1, 1.3, 1.4, 1.9, 1.10, 8.1_
    - _Design: K2, K3, K4, K5_
  - [ ]* 4.3 Write property tests for the scanner verdict and finding report
    - **Property 1: Scanner verdict never passes on a finding or a tool error**
    - **Validates: Requirements 1.1, 1.2, 1.4**
    - **Property 2: Finding reports never contain the matched value**
    - **Validates: Requirements 1.3**
    - Tag: `Feature: github-repository-launch, Property 1` and `Property 2`.

- [ ] 5. Checkpoint: preflight passed
  - Confirm K2, K3, K4 and K5 show pass with recorded command, exit code and excerpt. Stop and ask the Human_Operator if any finding appears. Ensure all checks pass, ask the user if questions arise.

- [ ] 6. Phase 3: Author artifacts (S3)
  - [ ] 6.1 Apply the `comments.json` decision (owner: `devops`, or the Human_Operator)
    - "commit": no file change. "delete": the Human_Operator confirms, then delete `comments.json`. "ignore": add exactly one line `comments.json` to `.gitignore` and change nothing else.
    - Edits only `.gitignore` or `comments.json`.
    - _Requirements: 1.10, 10.1, 10.2_
  - [ ] 6.2 Create `LICENSE` (owner: `documentation`)
    - Write the SPDX `MIT` text with exactly one changed line, `Copyright (c) 2026 <holder>`, no text before or after, no file extension. Create no other root license file.
    - Creates `LICENSE`.
    - _Requirements: 4.1, 4.3_
  - [ ] 6.3 Add the `license` field to root `package.json` (owner: `devops`, or the Human_Operator)
    - Add `"license": "MIT"` and change nothing else. Verify with a JSON diff against the baseline blob.
    - Edits `package.json`.
    - _Requirements: 4.7, 10.2_
  - [ ] 6.4 Create `CODE_OF_CONDUCT.md` (owner: `documentation`)
    - Only with the conduct contact from 2.1. State adoption of Contributor Covenant 2.1, link its canonical URL, name the contact as the only reporting channel. If the contact is an email address, it needs per-line approval in task 8.2.
    - Creates `CODE_OF_CONDUCT.md`.
    - _Requirements: 7.1, 7.2, 10.4_
  - [ ] 6.5 Update the Reporting section of `SECURITY.md` (owner: `security`)
    - Replace only the body under the Reporting heading with a link to `https://github.com/ousssamarahmani/<name>/security/advisories/new` and the statement that vulnerabilities must not be reported in public issues, pull requests or discussions.
    - Evidence: `git diff SECURITY.md` shows no changed line outside the Reporting section.
    - Edits `SECURITY.md`.
    - _Requirements: 7.3, 10.2_
  - [ ] 6.6 Create the `.github` templates (owner: `devops`, or the Human_Operator)
    - Create `.github/ISSUE_TEMPLATE/bug_report.yml` (required: steps to reproduce, expected, actual, environment with OS, Node version, pnpm version), `.github/ISSUE_TEMPLATE/feature_request.yml` (required: the problem, the proposed change), `.github/ISSUE_TEMPLATE/config.yml` (`blank_issues_enabled: false`, one contact link to the advisory URL labeled for security reports), and `.github/pull_request_template.md` (task ID, branch `task/<ID>-short-name`, eight unchecked items in the order objective, files, decisions, tests executed, test results, remaining issues, blockers, next task).
    - Field types limited to `markdown`, `input`, `textarea`, `dropdown`, `checkboxes`. Create nothing under `.github/workflows/`.
    - If run by an agent that is not `devops`, file a handoff to `devops` instead and leave `.github/` unchanged.
    - _Requirements: 7.6, 7.7, 7.8, 7.9, 7.10_
  - [ ] 6.7 Generate the social preview image (owner: `documentation`)
    - Using Windows PowerShell 5.1 with `System.Drawing` and no new dependency, create `docs/assets/brand/lathe-social-preview.png`: 1280 by 640, background sampled from the logo corner, logo at 300 px height placed left, the word "Lathe" and the approved tagline to the right, every content pixel at least 40 px from each edge, file below 1,000,000 bytes.
    - Verify without `System.Drawing`: parse the PNG signature and IHDR for width, height and the file length, then scan pixels for the content bounding box. Record the exact command and output (width, height, bytes, bounding box).
    - If the tool or font is unavailable, stop and ask the Human_Operator to approve a named tool or supply the image (R8.6). If a check fails, keep the image out of every commit (R8.5).
    - **HUMAN GATE**: show the image to the Human_Operator and record the yes or no visual confirmation (R8.7) before it is staged.
    - Creates `docs/assets/brand/lathe-social-preview.png`.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
    - _Design: Social preview_
  - [ ] 6.8 Write the README (owner: `documentation`)
    - Rewrite `README.md` to the design skeleton: centered HTML header with the logo (`docs/assets/brand/lathe-logo.png`, non-empty alt naming Lathe), name, tagline; one link row (Code · Docs · How it works · Architecture, no Website link); status callout of at most 8 lines; header, link row and callout at most 30 lines before the first `##`.
    - Exactly these ten `##` headings in order: What Lathe is; The loop; Architecture; Repository layout; Reference apps; Quickstart; How Kiro is used; Contributing; Security; License.
    - Status labels: read `docs/reports/*.md`. Use Existing or Partial only for a component a report names with recorded test output, and record the report path for each. Everything else, including the loop and both apps, is Proposed.
    - The loop section uses only the option chosen at 2.1, states that Ship (DELIVER) is a draft PR a human approves and merges, and that no agent merges or deploys. If option (c) was chosen, first file the architect handoff `docs/handoffs/<from>-to-architect-workflow-wording.md` (requested wording, current Canonical_Workflow, where DEFINE sits, reason, deadline, blocked task ID) and leave `.kiro/steering/product.md` unchanged.
    - Architecture links `ARCHITECTURE.md` and every `docs/architecture/*.md`. Repository layout lists only existing directories unlabeled and `apps/`, `services/`, `integrations/`, `templates/`, `packages/shared-contracts` as Proposed. Reference apps describe Support Desk and Team Operations as two separate folders, both Proposed.
    - Quickstart: leave the command list as a placeholder until task 8.3 supplies results. State Node from `.nvmrc` and pnpm from the `packageManager` field exactly as the files read.
    - How Kiro is used links `docs/kiro-usage.md` and `AGENTS.md`, with dev-time and runtime (Proposed) in separate lists.
    - No screenshots, counts, benchmark numbers, "built with" badges, CI badge, or text copied from another repository.
    - Edits `README.md`. May create `docs/handoffs/<from>-to-architect-workflow-wording.md` (option c only).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.13, 5.14, 5.15, 5.16, 5.17, 6.2, 6.3, 6.4, 6.5, 6.6, 10.4, 10.5_
    - _Design: README.md_
  - [ ] 6.9 Fix links in `CONTRIBUTING.md` (owner: `documentation`)
    - Add or correct only Markdown hyperlinks to files that will exist in the Commit_Set. No other line changes. Evidence: `git diff CONTRIBUTING.md` shows only link target or link text changes.
    - Edits `CONTRIBUTING.md`.
    - _Requirements: 7.5, 10.2_
  - [ ]* 6.10 Write property tests for the authored community and license files
    - **Property 3: Forbidden-path predicate**
    - **Validates: Requirements 1.5, 4.3, 7.10**
    - **Property 4: `.env.example` validator**
    - **Validates: Requirements 1.6**
    - **Property 14: LICENSE generation**
    - **Validates: Requirements 4.1**
    - **Property 17: Issue form validator**
    - **Validates: Requirements 7.6, 7.7**
    - Tag each as `Feature: github-repository-launch, Property <n>`. Run against the real files from 6.2 and 6.6 as well.
  - [ ]* 6.11 Write property tests for the image checks
    - **Property 15: PNG header parsing and preview validity**
    - **Validates: Requirements 8.1, 8.2, 8.5**
    - **Property 16: Preview margin check**
    - **Validates: Requirements 8.3**
  - [ ]* 6.12 Write property tests for the README checks
    - **Property 10: README structure validator**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.15, 5.16**
    - **Property 11: README links resolve, and image extraction round-trips**
    - **Validates: Requirements 5.2, 5.7, 5.18, 5.19, 9.6**
    - **Property 12: Status labels and loop section**
    - **Validates: Requirements 5.4, 5.6, 6.2, 6.3, 6.5, 6.6**

- [ ] 7. Checkpoint: **HUMAN GATE G2**, artifacts approved
  - Show the Human_Operator the content of every created or edited file and the social preview. Record approval per file with the SHA-256 of the approved content. A later change invalidates that approval. Stop and ask if anything is rejected, and return to the owning task. Ensure all checks pass, ask the user if questions arise.

- [ ] 8. Phase 4: Stage and run the Pre_Publish_Check (S4, S5)
  - [ ] 8.1 Stage the approved files and run the index checks
    - Stage by explicit path only (no `git add -A`). Run K7 (`gitleaks git --staged`), K8 (forbidden paths), K9 (`.env.example` lines via `git show :.env.example`), K10 (`.kiro/agents` and `.kiro/steering` have files, K3 clean), K11 (only `LICENSE` at the root), and record `git write-tree` as the verified tree id (K13).
    - Run the checks on the cumulative index (C5). Any failure: stop before commit, list offending paths, and use `git restore --staged` only to unstage.
    - Evidence: each command, exit code, finding count, tree id.
    - _Requirements: 1.2, 1.5, 1.6, 1.7, 1.8, 1.13, 4.3_
    - _Design: K7 to K11, K13_
  - [ ] 8.2 **HUMAN GATE**: report local-data matches and collect approvals
    - Run K12 over the staged content: `git grep --cached -n -I -i -E` for user-profile paths (character-class form from the design), email addresses and phone-like numbers. List every match as file, line, category. Expect matches in `requirements.md` and `design.md` (conflict C4) and possibly in `CODE_OF_CONDUCT.md`.
    - The Human_Operator approves or removes each one. Approval is keyed by file, line and hash of the line. After every change, re-run K12 and K13 until all matches are approved or gone. Do not filter the phone-like matches silently.
    - Spec files under `.kiro/specs/**` belong to `architect`: if an edit is chosen, file a handoff instead of editing.
    - _Requirements: 1.11, 1.12, 1.13, 7.1_
    - _Design: K12, conflict C4_
  - [ ] 8.3 Pre-validate the Quickstart on an export of the staged index
    - Export with `git checkout-index -a --prefix=<temp>/pre/`, with no `node_modules/` present. In that directory run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` in order. Record command, exit code and a 20-line excerpt for each.
    - `pnpm install` failure: stop and report. Another command failing: it is removed from the README Quickstart (edit `README.md`) or the procedure stops (R5.12). List in the README Quickstart only commands that exited 0. Re-read `.nvmrc` and `packageManager` and make the README match.
    - If `README.md` changes, repeat 8.1 and 8.2 for the new tree id.
    - Run only in temp, never in the workspace.
    - _Requirements: 5.10, 5.11, 5.12, 10.8_
    - _Design: K17, conflicts C7, C8_
  - [ ] 8.4 Check every README link, image path and anchor
    - Run the link checker on the staged `README.md`: relative links and images against `git ls-files --cached`, anchors against the README `##` headings with GitHub slug rules, external URLs with `Invoke-WebRequest -Method Head`. Write the table (link, result) to the report draft as Appendix D.
    - Any "does not resolve": stop before commit, fix or remove (task 6.8 or 6.9), and re-run.
    - Confirm the README contains no CI badge while `.github/workflows/` is empty.
    - _Requirements: 5.2, 5.7, 5.15, 5.18, 5.19_
    - _Design: K18_
  - [ ]* 8.5 Write property test for the local-data detector
    - **Property 5: Local-data detector recall and precision**
    - **Validates: Requirements 1.11, 1.12**
    - Include a seeded negative check in a temp copy only: a fake `.env` and a dummy token-like string must make K8 and the scanner fail. Label it "seeded in temp copy".

- [ ] 9. Checkpoint: pre-publish checks passed
  - Confirm the latest K7 to K13, K17 (pre-validation), K18 results all passed on the same tree id as the current `git write-tree`. If the tree id differs, re-run the checks (R1.13). Stop and ask the Human_Operator if any check failed. Ensure all checks pass, ask the user if questions arise.

- [ ] 10. Phase 5: Create the approved commits (S6)
  - [ ] 10.1 **HUMAN GATE G3**: approve the exact Commit_Set and commit messages
    - Show `git ls-files --cached` and the proposed messages (three Conventional Commits from the design, at most 72 characters each, types from the allowed list). Run K14 on each message.
    - Record the approval with a hash over the file list plus messages. The repository stays at zero commits until this is recorded. If the list or any message changes later, the approval is invalid: ask again (R2.9).
    - _Requirements: 2.5, 2.7, 2.9_
    - _Design: K14, Commit plan_
  - [ ] 10.2 Set the local git identity
    - Only with the validated name and email: `git config --local user.name` and `git config --local user.email`. Record the values read back with `git config --local --get`. Do not use `--global` or `--system`.
    - _Requirements: 2.1, 2.2_
    - _Design: K1_
  - [ ] 10.3 Create commit 1 (scaffold, Kiro config, license)
    - Immediately before: `git branch --show-current` returns `main` (K15), the index tree id equals the approved one (K13), K7 passes again. Then commit with the approved message.
    - Run only with the Human_Operator present and the G3 record valid. Record `git rev-parse HEAD`.
    - _Requirements: 2.6, 2.8, 1.2, 1.13_
    - _Design: K13, K15_
  - [ ] 10.4 Create commit 2 (architecture and docs)
    - Same pre-commit checks (K15, K13, K7) as 10.3 on the cumulative index, then commit with the approved message. Record `git rev-parse HEAD`.
    - _Requirements: 2.6, 2.8, 1.2, 1.13_
  - [ ] 10.5 Create commit 3 (README and community files)
    - Same pre-commit checks as 10.3, then commit with the approved message. Record `git rev-parse HEAD`. The total number of commits equals the approved number.
    - _Requirements: 2.6, 2.8, 1.2, 1.13_

- [ ] 11. Phase 6: Verify the local commits before any push (S7)
  - [ ] 11.1 Verify identity, branch and global configuration
    - K16: `git log --format="%an|%ae|%cn|%ce|%s" main` and `git branch --list`. Author and committer equal the recorded identity, every subject passes K14, only `main` exists.
    - K1 "after" snapshot: `git config --global --list` and `git config --system --list` identical in output and exit code to the "before" snapshot from 1.1.
    - Any mismatch is reported to the Human_Operator before any push.
    - _Requirements: 2.2, 2.10_
    - _Design: K1, K16_
  - [ ] 11.2 Run the Quickstart in a fresh clone of committed `main`
    - `git clone --no-hardlinks <workspace> <temp>\fresh`, no `node_modules/` present, then `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` in the README order. Record command, exit code and excerpt (20 lines) for each, and the host Node and pnpm versions.
    - After the run, `git status --porcelain` in the clone must be empty. A lockfile or tracked change is reported (C8). Confirm the README commands are exactly those that exited 0, and that the stated Node and pnpm versions equal `.nvmrc` and `packageManager`.
    - Failure: fix by a new commit through G3 again (never amend), or stop.
    - _Requirements: 5.10, 5.11, 5.12, 10.8_
    - _Design: K17, conflicts C1, C7, C8_
  - [ ] 11.3 Re-check README links against the committed tree
    - Re-run the K18 link checker against `git ls-files` of `HEAD`. Record each link with its result in Appendix D. Any unresolved link stops the procedure before the push.
    - _Requirements: 5.18, 5.19_
    - _Design: K18_
  - [ ] 11.4 Compare the baseline manifest with HEAD
    - K19: compare `baseline.tsv` with `git ls-tree -r HEAD`. List every added, removed or changed path and confirm each is on the R10.1 list. For `package.json`, `.gitignore`, `SECURITY.md`, `CONTRIBUTING.md` and `comments.json`, record `git diff <baselineBlob> HEAD:<path>` and confirm it meets R10.2. Confirm unchanged protected paths (`.kiro/steering/`, `.kiro/agents/`, `.kiro/hooks/`, `packages/`, `infra/`, `pnpm-lock.yaml`, `.env.example`, `docs/adr/`, `docs/architecture/`, `docs/agents/`, `AGENTS.md` and the others in R10.2) have the baseline blob id.
    - Any offending path or diff: stop before the push and report path and diff.
    - _Requirements: 10.1, 10.2, 10.8, 4.7, 7.3, 7.5_
    - _Design: K19_
  - [ ] 11.5 Scan the full commit history
    - K20: `gitleaks git` over history with `--redact` and exit code 2 for leaks. Verdict must be pass.
    - _Requirements: 1.1, 1.3, 1.4_
    - _Design: K20_
  - [ ]* 11.6 Write property tests for commit validators and the allow-list classifier
    - **Property 7: Commit message and log validators**
    - **Validates: Requirements 2.5, 2.10**
    - **Property 9: Allow-list and partial-edit classifier**
    - **Validates: Requirements 4.7, 7.3, 7.5, 7.9, 10.1, 10.2, 10.7, 10.8**
    - Include a seeded negative check in a temp copy: a disallowed changed path must make K19 fail.

- [ ] 12. Checkpoint: commits created and fresh-clone verification passed
  - Confirm K16, K1, K17 (fresh clone), K18, K19 and K20 all passed on the current `HEAD`. A fix is a new commit with a new G3 approval, followed by a re-run of 11.1 to 11.5. Stop and ask the Human_Operator if any check failed. Ensure all checks pass, ask the user if questions arise.

- [ ] 13. Phase 7: Create the remote repository (S8, S9)
  - [ ] 13.1 **HUMAN GATE G4**: confirm the name, check it is free, create the repository
    - Ask the Human_Operator to confirm the exact name and that creation may proceed. Record the confirmation.
    - K21: `gh repo view ousssamarahmani/<name>` must fail with not found. If it succeeds, stop and report the conflict, and run no create, edit or push command (R3.3).
    - K22: `gh repo create ousssamarahmani/<name> --public` with no `--source`, `--push` or `--clone`. Record command and exit code. On non-zero: stop, do not retry, run `gh repo view` to check whether it was created anyway, and report both.
    - _Requirements: 3.1, 3.2, 3.3, 3.12_
    - _Design: K21, K22_
  - [ ] 13.2 **HUMAN GATE G5**: approve description and topics, then set them
    - Ask the Human_Operator to approve the exact description text and Topic_List (hash-bound). Without approval, run no `gh repo edit`.
    - K23: `gh repo edit ousssamarahmani/<name> --description "<approved>" --add-topic <t1> --add-topic <t2> ...`. Leave the homepage empty. Record command and exit code.
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.11_
    - _Design: K23_
  - [ ] 13.3 Enable private vulnerability reporting
    - K24: `gh api -X PUT repos/ousssamarahmani/<name>/private-vulnerability-reporting -i`. HTTP 204 means enabled. Any other status: report status and body, give written steps (Settings, Code security), and record "not enabled" until the Human_Operator confirms it is on.
    - _Requirements: 7.4, 7.11_
    - _Design: K24_

- [ ] 14. Phase 8: First push (S10)
  - [ ] 14.1 **HUMAN GATE G6**: confirm the first push, add the remote, push `main`
    - Confirm that no remote is configured and K13 tree id and K20 result are current for `HEAD`. Ask the Human_Operator to confirm the push. Record the confirmation.
    - K25: `git remote add origin https://github.com/ousssamarahmani/<name>.git`, then `git push -u origin main`. No force flag, no `+refspec`, only `main`, no tags. If the push fails or is rejected: stop, no retry, keep local commits and the remote as they are, report command, exit code and error.
    - _Requirements: 3.9, 3.10, 3.13, 10.6_
    - _Design: K25_
  - [ ] 14.2 Confirm the default branch
    - K26: read the default branch. If it is not `main`, run `gh repo edit ousssamarahmani/<name> --default-branch main` and record command and exit code.
    - _Requirements: 3.8_
    - _Design: K26_

- [ ] 15. Checkpoint: remote created and pushed
  - Confirm K21 to K26 evidence is recorded, the remote has only `main`, and nothing else was pushed. Stop and ask the Human_Operator if any step failed. Ensure all checks pass, ask the user if questions arise.

- [ ] 16. Phase 9: Post-publish checks (S11)
  - [ ] 16.1 Verify repository metadata, license and `.kiro`
    - K27: `gh repo view ousssamarahmani/<name> --json visibility,description,homepageUrl,repositoryTopics,licenseInfo,defaultBranchRef`. Confirm visibility `PUBLIC`, default branch `main`, description equal to the approved text, empty homepage, topics equal the Topic_List as a set, `licenseInfo.key` equal to `mit`. If the license is null or not `mit`, re-run up to 10 more times at 30-second intervals, recording each output. Failure after the last attempt: report the last value (including null) and change nothing until approved.
    - K28: `gh api repos/ousssamarahmani/<name>/contents/.kiro` exits 0 and lists `agents` and `steering` as directories.
    - On any failed check: stop, report command, exit code and output, and make no further push, `gh repo edit` or settings change until the Human_Operator approves a specific correction.
    - _Requirements: 4.4, 4.5, 4.6, 9.1, 9.2, 9.3, 9.4, 9.8_
    - _Design: K27, K28_
  - [ ] 16.2 Verify push state and README images
    - K29: record `git rev-parse HEAD`, `git rev-parse origin/main`, `git status --porcelain`. Hashes equal, status empty.
    - K30: request each README image from `https://raw.githubusercontent.com/ousssamarahmani/<name>/main/<path>` with a 30-second timeout. Each returns HTTP 200. Record URL and status.
    - _Requirements: 9.5, 9.6, 9.8_
    - _Design: K29, K30, conflict C2_
  - [ ] 16.3 Verify the community profile
    - K31: `gh api repos/ousssamarahmani/<name>/community/profile`. Confirm code of conduct, contributing guide, license, security policy, issue templates and pull request template are each reported present. One re-run after 30 seconds is allowed and recorded.
    - If the code of conduct is reported absent because it is adopted by reference: **HUMAN GATE**, offer the two options of R7.13 and change no file until the Human_Operator records a choice.
    - _Requirements: 7.12, 7.13_
    - _Design: K31_
  - [ ] 16.4 Verify scope limits on the remote
    - K32: run the eight commands from R10.9 (tags, releases, workflows, hooks, keys, collaborators, Pages, branch protection). Expected results are in the R10.9 table. A 404 for Pages and branch protection counts as pass. Any other result is a failed check under R9.8.
    - _Requirements: 10.3, 10.6, 10.9, 9.8_
    - _Design: K32_
  - [ ]* 16.5 Write property test for the remote metadata verdict
    - **Property 13: Remote metadata verdict**
    - **Validates: Requirements 4.4, 9.2**

- [ ] 17. Phase 10: Manual steps in the web UI (G7, G8)
  - [ ] 17.1 **HUMAN GATE G7**: upload the social preview
    - Give the Human_Operator written steps: Settings, General, Social preview, upload `docs/assets/brand/lathe-social-preview.png`. This cannot be done through the API. Do not attempt it.
    - Record the confirmation as a screenshot path under `docs/assets/brand/` or the Human_Operator's written confirmation with the date. If not reported done, record "pending, manual" under remaining issues and never describe it as completed.
    - Record the avatar note: the repository avatar is the `ousssamarahmani` account profile picture and is changed outside repository settings.
    - _Requirements: 8.8, 8.9, 8.10, 8.11_
  - [ ] 17.2 **HUMAN GATE G8**: visual check of the repository page
    - After 16.1, 16.2 and the K29 check passed, ask the Human_Operator to open the repository page and confirm four things: the logo shows without a broken-image indicator, the name Lathe and the tagline are visible, every link-row link opens without a 404, and the About sidebar shows the description, every topic and the MIT license. Record the answer for each with the date.
    - _Requirements: 9.7_

- [ ] 18. Checkpoint: post-publish checks passed
  - Confirm K27 to K32 passed, G7 and G8 are recorded (or marked pending, manual), and no failed check is open. Stop and ask the Human_Operator about any open item. Ensure all checks pass, ask the user if questions arise.

- [ ] 19. Phase 11: Launch report, commit and final push (S12, S13)
  - [ ] 19.1 Assemble the launch report
    - Write `docs/reports/github-repository-launch-documentation.md` from `evidence.jsonl` and `report-draft.md` in the eight-part format of `.kiro/steering/agent-workflow.md`: objective (say "partially completed" if so), files, decisions with rejected alternatives, tests executed (exact commands), results (pass and fail counts, excerpts with no secret values, exit codes), remaining issues (for example social preview pending, private vulnerability reporting status, avatar note), blockers, next task.
    - Appendices: A baseline manifest copied from `baseline.tsv`; B decision and approval records including the loop option record (R6.7); C allow-list diff and partial-edit diffs; D README link table; E scanner and approval records; F the two third-party exceptions (MIT text from SPDX, Contributor Covenant 2.1 by reference); G SHA-256 of each temp script. Include the Human_Operator's G8 confirmation and each check's command, exit code, excerpt and result.
    - Any check that was not run is marked "not run" with the reason. Nothing is described as done without evidence in the report.
    - Creates `docs/reports/github-repository-launch-documentation.md`.
    - _Requirements: 9.9, 8.4, 8.9, 8.10, 8.11, 6.7, 10.4, 10.7, 10.8, 10.9_
    - _Design: Launch report_
  - [ ]* 19.3 Write property tests for the command log and report layout
    - **Property 8: Gated command-log invariant**
    - **Validates: Requirements 1.13, 2.7, 2.8, 2.9, 3.2, 3.9, 3.10, 3.11, 3.12, 3.13, 10.3, 10.6**
    - **Property 18: Launch report layout**
    - **Validates: Requirements 9.9**
    - Run Property 8 over the complete recorded command log in `evidence.jsonl`.
  - [ ] 19.2 **HUMAN GATE G9**: approve the report, commit it alone, push, re-check state
    - Ask the Human_Operator to approve the report content (hash-bound). After approval, stage only the report file, run K7 on the staged index, K15 (branch `main`) and K14 on the message, then commit with a Conventional Commits message (for example `docs: add GitHub launch report`) and `git push origin main` without force flags.
    - Re-run K29: `git rev-parse HEAD`, `git rev-parse origin/main`, `git status --porcelain`. Report the hashes and status. Any difference or non-empty status is a failed check under R9.8. Record both K29 runs (after first push and after report push).
    - _Requirements: 9.10, 9.11, 10.1, 3.10_
    - _Design: S13, K29, conflict C2_

- [ ] 20. Final checkpoint: launch report committed
  - Confirm the report is committed and pushed, the second K29 run passed, and no open failure remains. List any item marked pending (for example the social preview upload) for the Human_Operator. Do not start follow-up work such as CI (task P0-06) in this spec. Ensure all checks pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property checks. They run as one-off scripts in `$env:TEMP\lathe-launch\selftest\` and are never added to the repository. The verification commands the requirements demand (secret scans, link check, image dimensions, allow-list diff, post-publish `gh` checks) are core tasks.
- Task 19.3 is numbered after 19.1 in the list but runs before the approval step in 19.2. Run it first.
- Every **HUMAN GATE** stops and asks. Approvals are bound to a hash of the approved content, and changed content invalidates the approval.
- Each requirement reference is to a numbered acceptance criterion in `requirements.md`. Check ids K0 to K32 refer to `design.md`.
- No task creates CI workflows, releases, tags, Pages, branch protection, or any repository setting beyond Requirement 10.3.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.4", "6.5", "6.6", "6.7"] },
    { "id": 7, "tasks": ["6.3", "6.8", "6.9", "6.10", "6.11"] },
    { "id": 8, "tasks": ["6.12"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2"] },
    { "id": 11, "tasks": ["8.3", "8.4", "8.5"] },
    { "id": 12, "tasks": ["10.1"] },
    { "id": 13, "tasks": ["10.2"] },
    { "id": 14, "tasks": ["10.3"] },
    { "id": 15, "tasks": ["10.4"] },
    { "id": 16, "tasks": ["10.5"] },
    { "id": 17, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 18, "tasks": ["11.6"] },
    { "id": 19, "tasks": ["13.1"] },
    { "id": 20, "tasks": ["13.2"] },
    { "id": 21, "tasks": ["13.3"] },
    { "id": 22, "tasks": ["14.1"] },
    { "id": 23, "tasks": ["14.2"] },
    { "id": 24, "tasks": ["16.1", "16.2", "16.3", "16.4"] },
    { "id": 25, "tasks": ["16.5", "17.1"] },
    { "id": 26, "tasks": ["17.2"] },
    { "id": 27, "tasks": ["19.1"] },
    { "id": 28, "tasks": ["19.3"] },
    { "id": 29, "tasks": ["19.2"] }
  ]
}
```
