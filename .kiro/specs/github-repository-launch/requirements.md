# Requirements Document

## Introduction

This spec covers publishing the Lathe project as a public GitHub repository under the account `ousssamarahmani`, with a presentation that gives a strong, honest first impression: a centered logo header, a link row, an About description with topics, clear README sections, community health files, `.github/` templates and a social preview image derived from the Lathe logo.

The layout takes inspiration from how well-organized open source repositories (for example `warpdotdev/warp`) present themselves. No code, text, images, badges or files from any other repository are copied.

Current state (verified at spec time):
- The local folder has `git init -b main` with zero commits and no remote. Global `user.name` and `user.email` are not configured.
- `gh` CLI 2.97.0 is authenticated as `ousssamarahmani` with `repo` and `workflow` scopes.
- No `LICENSE`, no `.github/`, no `apps/`, `services/`, `integrations/` or `packages/shared-contracts` exist. `packages/application-foundation` and `packages/verification-harness` contain smoke tests only.
- The Lathe logo exists only as a chat attachment and is not saved in the repository.
- Every product capability is Proposed. Only the scaffold (P0-02) and contracts work (P0-03) have reports.

GitHub platform constraints that shape these requirements:
- A repository has no avatar of its own. The avatar shown is the owner account's profile picture.
- The repository social preview image can be uploaded only through the GitHub web UI (Settings → General → Social preview). GitHub recommends 1280×640 px, PNG, JPG or GIF, under 1 MB. No supported REST API exists for this upload.
- Description, homepage and topics can be set with `gh repo edit`.

Kiroween 2026 rules (Skeleton Crew) that the published repository must satisfy:
- The repository is public.
- The repository contains an open source license that GitHub detects and shows in the About section.
- `/.kiro` exists at the repository root and is never gitignored.
- The two applications live in two separate folders.

Publishing is hard to reverse: a public push exposes the full history. For that reason, every step that creates, publishes or changes visibility requires explicit human confirmation.

## Glossary

- **Human_Operator**: The person who owns the `ousssamarahmani` GitHub account and approves each irreversible step.
- **Publishing_Procedure**: The ordered set of steps, executed by an agent or the Human_Operator, that prepares, creates, pushes and verifies the repository.
- **Local_Repository**: The git repository at the workspace root on the Human_Operator's machine.
- **Remote_Repository**: The public GitHub repository created under `ousssamarahmani` by the Publishing_Procedure.
- **Commit_Set**: The exact set of files staged for the first commit or commits, as listed by `git ls-files --cached` after staging.
- **Pre_Publish_Check**: The set of safety checks run against the working tree and the Commit_Set before any commit or push.
- **Secret_Scanner**: A secret detection tool (for example `gitleaks` or an equivalent chosen in design) run locally by the Pre_Publish_Check.
- **README**: The root `README.md` file of the Local_Repository.
- **Logo_File**: The Lathe logo image (dark isometric rounded-square tile with two white horizontal bars on a black background) saved at `docs/assets/brand/lathe-logo.png`.
- **Social_Preview_Image**: A 1280×640 px image derived from the Logo_File, with a dark background, the logo, the word "Lathe" and the tagline, saved at `docs/assets/brand/lathe-social-preview.png`.
- **Community_Health_Files**: `LICENSE`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md`.
- **Canonical_Workflow**: The product workflow defined in `.kiro/steering/product.md`: DEFINE → PLAN → BUILD → TEST → VERIFY → DELIVER, with "Ship" as the UI label for DELIVER.
- **Requested_Loop_Wording**: The phrasing "Build → Debug → Verify → Ship" supplied by the Human_Operator for this launch.
- **Status_Vocabulary**: The labels Existing, Partial, Missing and Proposed defined in `.kiro/steering/product.md`.
- **Traceable_Claim**: A statement in the README that links to, or names, a file in the Local_Repository that supports the statement.
- **Topic_List**: The set of GitHub repository topics approved by the Human_Operator.
- **Baseline_Manifest**: The list of paths and blob ids recorded before any change (Requirement 10 criterion 7).
- **Launch_Report**: `docs/reports/github-repository-launch-<role>.md`.

## Requirements

### Requirement 1: Pre-publish safety checks

**User Story:** As the Human_Operator, I want the working tree and the Commit_Set checked for secrets and unwanted files before anything is committed or pushed, so that publishing does not leak credentials or personal data.

#### Acceptance Criteria

1. WHEN the Publishing_Procedure starts, THE Pre_Publish_Check SHALL run the Secret_Scanner against every file in the working tree except paths under `node_modules/` and `.git/`, including `pnpm-lock.yaml` and all files under `docs/`, and SHALL record the exact command, its exit code and the number of findings in the evidence shown to the Human_Operator.
2. WHEN files are staged for any commit, THE Pre_Publish_Check SHALL run the Secret_Scanner against every file in the Commit_Set before that commit is created, and SHALL record the exact command, its exit code and the number of findings in the evidence shown to the Human_Operator.
3. IF the Secret_Scanner reports one or more findings, THEN THE Publishing_Procedure SHALL stop before any commit, push or Remote_Repository creation, SHALL report each finding's file path, line number and rule name to the Human_Operator and the `security` role without including the matched value in any report, log or evidence, and SHALL leave the Commit_Set uncommitted and the working tree unmodified.
4. IF the Secret_Scanner is not installed, fails to start, or exits with a code that indicates a tool error rather than a finding, THEN THE Publishing_Procedure SHALL treat the result as failed, stop before any commit or push, and report the exact command and exit code to the Human_Operator.
5. WHEN files are staged for any commit, THE Pre_Publish_Check SHALL confirm that the Commit_Set contains no path matching `.env`, `.env.*` other than `.env.example`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*` or any path under `node_modules/`, matching at any directory depth.
6. WHEN files are staged for any commit, THE Pre_Publish_Check SHALL confirm that every line of `.env.example` in the Commit_Set is blank, a comment starting with `#`, or a variable name followed by `=` with no characters after the `=`.
7. WHEN files are staged for any commit, THE Pre_Publish_Check SHALL confirm that the Commit_Set contains at least one file under `.kiro/agents/` and at least one file under `.kiro/steering/`, and that `git check-ignore .kiro` reports no matching ignore rule.
8. IF any check in criteria 5, 6 or 7 fails, THEN THE Publishing_Procedure SHALL stop before the commit, report the failing check and each offending path to the Human_Operator, and leave the Commit_Set uncommitted.
9. IF `.gitignore` contains a pattern that ignores `.kiro` or any path under `.kiro`, THEN THE Publishing_Procedure SHALL stop before staging and report the pattern and its line number to the Human_Operator.
10. WHEN the Pre_Publish_Check finds `comments.json` in the working tree, THE Publishing_Procedure SHALL apply the Human_Operator's recorded decision (commit, delete, or add to `.gitignore`) before staging, and IF no decision is recorded, THEN THE Publishing_Procedure SHALL stop before staging and ask the Human_Operator for one.
11. WHEN files are staged for the first commit, THE Pre_Publish_Check SHALL search every text file in the Commit_Set for email addresses, phone numbers and absolute local paths that contain `C:\Users\` or `C:/Users/` in any letter case, and SHALL report every match to the Human_Operator with file path, line number and match category before the first commit. Placeholder strings in documentation and home-relative paths such as `~/.kiro/agents/` count as matches only when they contain one of these patterns.
12. IF a match from criterion 11 has no recorded approval from the Human_Operator for that file path and line, THEN THE Publishing_Procedure SHALL leave the Commit_Set uncommitted until the match is removed or approved, and SHALL re-run criterion 11 after each change before committing.
13. WHEN any file in the working tree or Commit_Set changes after a Pre_Publish_Check has passed and before the push, THE Pre_Publish_Check SHALL re-run criteria 2, 5, 6, 7 and 11 against the updated Commit_Set, and THE Publishing_Procedure SHALL push only after the latest run of every check has passed.

### Requirement 2: Git identity and history

**User Story:** As the Human_Operator, I want commits authored with an identity I choose and a clean, conventional history, so that the public history is attributable and readable.

#### Acceptance Criteria

1. WHEN the Human_Operator supplies an author name and email, THE Publishing_Procedure SHALL set `user.name` and `user.email` with `git config --local` in the Local_Repository and record the values returned by `git config --local --get user.name` and `git config --local --get user.email`.
2. THE Publishing_Procedure SHALL leave the global and system git configuration unchanged, including `core.autocrlf`. The proof is that `git config --global --list` and `git config --system --list` return identical output and exit codes when recorded before the first git configuration change and again after the last commit.
3. IF the Human_Operator has not supplied an author name and email, or the name is empty or longer than 100 characters, or the email lacks exactly one `@` with at least one character on each side, THEN THE Publishing_Procedure SHALL stop before the first commit, request the missing or invalid values, and keep the Local_Repository at zero commits.
4. WHERE the Human_Operator chooses a GitHub noreply address (`<id>+ousssamarahmani@users.noreply.github.com`, where `<id>` is the numeric GitHub account ID supplied by the Human_Operator), THE Publishing_Procedure SHALL use that address exactly as supplied as `user.email`.
5. THE Publishing_Procedure SHALL write every commit message with a first line in Conventional Commits format (`<type>: <subject>` or `<type>(<scope>): <subject>`). In that line, `<type>` is one of `feat`, `fix`, `docs`, `chore`, `build`, `ci`, `refactor`, `test`, `style` or `perf`, `<subject>` is non-empty, and the whole line is at most 72 characters.
6. IF `git branch --show-current` returns a value other than `main` immediately before a commit, THEN THE Publishing_Procedure SHALL stop without committing and report the current branch name to the Human_Operator.
7. WHILE the Human_Operator has not approved the Commit_Set and the commit messages, THE Publishing_Procedure SHALL keep the Local_Repository at zero commits.
8. WHEN the Human_Operator approves the Commit_Set and the commit messages, THE Publishing_Procedure SHALL create exactly the approved number of commits with the approved messages, and record the output of `git rev-parse HEAD`.
9. IF the file list from `git ls-files --cached` or any commit message differs from the version the Human_Operator approved, THEN THE Publishing_Procedure SHALL treat the approval as invalid, create no commit, and request a new approval with the changed list or messages shown.
10. WHEN the last approved commit is created, THE Publishing_Procedure SHALL use `git log --format='%an|%ae|%cn|%ce|%s' main` to confirm three things: the author and committer name and email of every commit equal the values recorded in criterion 1, every subject line meets criterion 5, and `git branch --list` returns only `main`. THE Publishing_Procedure SHALL report any mismatch to the Human_Operator before any push.

### Requirement 3: Remote repository creation

**User Story:** As the Human_Operator, I want the public repository created with the name, description and topics I approve, so that the About sidebar presents Lathe accurately.

#### Acceptance Criteria

1. IF the Human_Operator has not confirmed a repository name, or the confirmed name is not 1 to 100 characters made only of letters, digits, hyphens, underscores and periods, THEN THE Publishing_Procedure SHALL stop before creating the Remote_Repository and ask the Human_Operator for a valid name. The proposed name is `lathe`.
2. WHEN the Human_Operator confirms creation, THE Publishing_Procedure SHALL first run `gh repo view ousssamarahmani/<name>` to check that no repository with that name exists. Only after that check SHALL it create the Remote_Repository with `gh repo create ousssamarahmani/<name> --public`, without the `--source`, `--push` or `--clone` flags, and record the exact command and its exit code.
3. IF the existence check in criterion 2 shows that a repository with the confirmed name already exists under `ousssamarahmani`, THEN THE Publishing_Procedure SHALL stop and report the conflict to the Human_Operator. It SHALL run no create, edit or push command against the existing repository.
4. WHEN the Remote_Repository has been created, THE Publishing_Procedure SHALL set the Remote_Repository description to the exact text the Human_Operator approved. That text SHALL be 1 to 350 characters long, counted as Unicode characters. The proposed text is "A verified mini software factory for agent-native development. Kiro agents build; deterministic gates verify. Kiroween 2026 · Skeleton Crew."
5. WHILE the Human_Operator has not supplied a Lathe website URL, THE Publishing_Procedure SHALL leave the Remote_Repository homepage empty.
6. WHEN the Remote_Repository has been created, THE Publishing_Procedure SHALL set the Remote_Repository topics to exactly the Topic_List with `gh repo edit --add-topic` and record the exact command and its exit code. The proposed Topic_List is `kiro`, `kiroween`, `ai-agents`, `software-factory`, `multi-tenant`, `row-level-security`, `postgresql`, `typescript`, `verification`, `agentic-coding`.
7. THE Publishing_Procedure SHALL use a Topic_List of 1 to 20 unique topics. Each topic SHALL be 1 to 50 characters long, lowercase, made only of letters, digits and hyphens, and start with a letter or digit.
8. WHEN the first push completes, THE Publishing_Procedure SHALL confirm that the Remote_Repository default branch is `main`. If it is not, THE Publishing_Procedure SHALL set it with `gh repo edit --default-branch main` and record the command and its exit code.
9. WHEN the Human_Operator confirms the first push, THE Publishing_Procedure SHALL add the remote `origin` with the URL `https://github.com/ousssamarahmani/<name>.git` and push `main` to the Remote_Repository. Before that confirmation, THE Publishing_Procedure SHALL keep the Remote_Repository free of any pushed commit and keep the Local_Repository free of any configured remote.
10. THE Publishing_Procedure SHALL use only push commands without force flags (`--force`, `--force-with-lease`, `+refspec`).
11. IF the Human_Operator has not approved the description text or the Topic_List, THEN THE Publishing_Procedure SHALL stop before running any `gh repo edit` command and ask for the missing approval. The Remote_Repository description and topics SHALL stay empty until that approval exists.
12. IF `gh repo create` exits with a non-zero code, THEN THE Publishing_Procedure SHALL stop without retrying and run `gh repo view ousssamarahmani/<name>` to check whether a repository was created anyway. It SHALL then report the command, exit code, error output and that check result to the Human_Operator.
13. IF the first push exits with a non-zero code or is rejected by the Remote_Repository, THEN THE Publishing_Procedure SHALL stop without retrying and keep the local commits and the `origin` remote unchanged. It SHALL then report the command, exit code and error output to the Human_Operator.

### Requirement 4: Open source license

**User Story:** As the Human_Operator, I want an MIT license that GitHub detects, so that the hackathon license rule is met and the license shows in the About sidebar.

#### Acceptance Criteria

1. WHEN the Human_Operator supplies a copyright holder name of 1 to 100 characters, THE Publishing_Procedure SHALL create a file named exactly `LICENSE`, with no file extension, at the Local_Repository root. The file SHALL contain the MIT License text as listed under SPDX identifier `MIT`, with exactly one line changed: the copyright line, which SHALL read `Copyright (c) 2026 <holder name>`. The file SHALL have no added text before or after the license text.
2. IF the Human_Operator has not supplied a copyright holder name, or the supplied name is empty or longer than 100 characters, THEN THE Publishing_Procedure SHALL stop before the first commit, request a valid value, and keep the Local_Repository at zero commits.
3. WHEN files are staged for the first commit, THE Pre_Publish_Check SHALL confirm that the Commit_Set contains `LICENSE` at the repository root. It SHALL also confirm that the Commit_Set contains no other root-level license file (`LICENSE.md`, `LICENSE.txt`, `COPYING` or `COPYING.*`).
4. WHEN the first push completes, THE Publishing_Procedure SHALL run `gh repo view ousssamarahmani/<name> --json licenseInfo`, record the command and its output, and confirm that `licenseInfo.key` equals `mit`.
5. IF `licenseInfo` is null, or `licenseInfo.key` is not `mit`, after the first check, THEN THE Publishing_Procedure SHALL re-run the check from criterion 4 following the retry policy in Requirement 9 criterion 3, and record each output.
6. IF `licenseInfo.key` is still not `mit` after the last attempt allowed by Requirement 9 criterion 3, THEN THE Publishing_Procedure SHALL report the last returned value (including null) and its command output to the Human_Operator. It SHALL then make no further change to `LICENSE` or to the Remote_Repository until the Human_Operator approves one.
7. WHEN `LICENSE` is created, THE Publishing_Procedure SHALL add a `license` field with value `MIT` to root `package.json` and change nothing else in that file.

### Requirement 5: README first impression

**User Story:** As a visitor or hackathon judge, I want a README that shows what Lathe is, what exists today and how to try it, so that I understand the project within one screen and trust what it says.

#### Acceptance Criteria

1. THE README SHALL begin with a header centered using an HTML block with `align="center"`, containing in this order: the Logo_File referenced by the relative path `docs/assets/brand/lathe-logo.png` with non-empty alt text that names Lathe, the name "Lathe", and a one-line tagline of at most 100 characters that is identical to the tagline in the Social_Preview_Image.
2. THE README SHALL contain, directly below the header, a single centered link row whose links are separated by " · " and whose every link resolves to a file in the Commit_Set, a heading anchor that exists in the README, or an external URL that returns a successful response at publish time. The proposed row is Code · Docs · How it works · Architecture. While no Lathe website exists, the row SHALL contain no "Website" link.
3. THE README SHALL contain, directly below the link row, a status callout of at most 8 source lines stating "pre-alpha", "Kiroween 2026, Skeleton Crew", the components labeled Existing or Partial, and the components labeled Proposed. The header, link row and status callout SHALL together take at most 30 lines of README source and SHALL come before the first second-level heading.
4. THE README SHALL label every component it names, including the components in the status callout and in any status table, with exactly one term from the Status_Vocabulary. THE README SHALL use Existing or Partial only for a component that a task report in `docs/reports/` names together with recorded test output, and SHALL label every other component Proposed.
5. THE README SHALL contain these second-level headings, with these exact titles and in this order, and no other second-level headings: What Lathe is; The loop; Architecture; Repository layout; Reference apps; Quickstart; How Kiro is used; Contributing; Security; License.
6. THE README SHALL describe the loop using the wording the Human_Operator selects under Requirement 6.
7. THE README Architecture section SHALL link to every diagram file in `docs/architecture/` that is in the Commit_Set and to `ARCHITECTURE.md`.
8. THE README Repository layout section SHALL list without a status label only directories that exist in the Commit_Set, and SHALL list each planned directory (`apps/`, `services/`, `integrations/`, `templates/`, `packages/shared-contracts`) labeled Proposed.
9. THE README Reference apps section SHALL describe Support Desk (`apps/support-desk/`) and Team Operations (`apps/team-operations/`) as two separate apps in two separate folders on the shared foundation, and SHALL label both as Proposed.
10. THE README Quickstart section SHALL list, in this order, only those of `pnpm install`, `pnpm typecheck`, `pnpm lint` and `pnpm test` that exit with code 0 under criterion 11. It SHALL also state the required Node version taken from `.nvmrc` and the pnpm version taken from the `packageManager` field of `package.json`, and both stated values SHALL equal the values in those files at publish time.
11. WHEN the README Quickstart is finalized and before the first push, THE Publishing_Procedure SHALL make a fresh clone of the Local_Repository's committed `main` branch in a temporary directory outside the workspace, with no `node_modules/` present, run each listed command there in the listed order, and record for each command the command text, the exit code and an output excerpt of at most 20 lines.
12. IF a Quickstart command other than `pnpm install` exits with a non-zero code during criterion 11, THEN THE Publishing_Procedure SHALL either remove that command from the README and record the removal and its reason in the launch report, or stop and report the failure to the Human_Operator. IF `pnpm install` exits with a non-zero code, THEN THE Publishing_Procedure SHALL stop before the first push and report the command output to the Human_Operator.
13. THE README How Kiro is used section SHALL link to `docs/kiro-usage.md` and `AGENTS.md`, and SHALL describe dev-time Kiro use (agents in `.kiro/agents/` that build Lathe) and runtime Kiro use (untrusted agents in sandboxes, labeled Proposed) in separate paragraphs or lists.
14. THE README SHALL make capability, metric and status statements only as Traceable_Claims.
15. THE README SHALL include a badge only for a service that is configured for the Remote_Repository and whose badge image returns a successful response at publish time. While no file exists under `.github/workflows/`, THE README SHALL contain no CI badge.
16. THE README SHALL contain no screenshots, star counts, download counts, benchmark numbers or "built with" badges.
17. THE README SHALL contain no text, image, badge or layout code copied from any other repository.
18. WHEN the README is finalized and before the first push, THE Publishing_Procedure SHALL check every relative link, image path and heading anchor in the README against the Commit_Set and the README headings, and SHALL record each link with its result (resolves or does not resolve) in the launch report.
19. IF a README link, image path or anchor does not resolve during criterion 18, THEN THE Publishing_Procedure SHALL stop before the first push, report the unresolved link to the Human_Operator, and leave the Remote_Repository without any pushed commit until the link is fixed or removed.

### Requirement 6: Workflow wording decision

**User Story:** As the Human_Operator, I want the README to use loop wording I choose explicitly, so that the public presentation and the product vocabulary in steering do not silently diverge.

#### Acceptance Criteria

1. IF the Human_Operator has not selected exactly one loop wording option, THEN THE Publishing_Procedure SHALL stop before writing the README loop section, leave the README loop section unwritten, and present these three options, each with the README text it would produce: (a) the Canonical_Workflow only; (b) the Requested_Loop_Wording as a summary with a stated mapping to the Canonical_Workflow; (c) the Requested_Loop_Wording only, with a handoff to the `architect` role to change `.kiro/steering/product.md`.
2. WHERE option (a) is selected, THE README loop section SHALL list the six Canonical_Workflow steps in the order DEFINE → PLAN → BUILD → TEST → VERIFY → DELIVER, and SHALL state that "Ship" is the UI label for DELIVER.
3. WHERE option (b) is selected, THE README loop section SHALL state this mapping, with each of the six Canonical_Workflow steps appearing exactly once: DEFINE (a human writes the spec) comes before Build and is outside the Requested_Loop_Wording; Build = PLAN (the human approves the plan) + BUILD; Debug = TEST + bounded repair from failure evidence; Verify = VERIFY (fresh re-verification, where only the Engine records a pass); Ship = DELIVER (a draft PR plus human approval).
4. WHERE option (c) is selected, THE Publishing_Procedure SHALL file `docs/handoffs/<from>-to-architect-workflow-wording.md` before writing the README loop section. The handoff SHALL state the Requested_Loop_Wording, the current Canonical_Workflow, where DEFINE is placed, the reason for the change, a deadline, and the blocked task ID. THE Publishing_Procedure SHALL leave `.kiro/steering/product.md` unchanged by this spec.
5. THE README SHALL state that Ship (DELIVER) means a draft pull request that a human approves and merges, and that no agent merges or deploys.
6. THE README loop section SHALL label the workflow with one Status_Vocabulary term that matches the latest task reports in `docs/reports/`, and SHALL NOT describe any workflow step as Existing unless a task report shows that step as done.
7. WHEN the Human_Operator selects a loop wording option, THE Publishing_Procedure SHALL record the selected option letter, the Human_Operator's name and the selection date in `docs/reports/github-repository-launch-<role>.md`. Where option (c) is selected, the record SHALL also include the handoff file path and whether `architect` has acknowledged it at publish time.

### Requirement 7: Community health files

**User Story:** As a potential contributor, I want standard community health files and templates, so that I know how to contribute, how to report a vulnerability and what conduct is expected.

#### Acceptance Criteria

1. WHEN the Human_Operator supplies a conduct contact method, THE Publishing_Procedure SHALL create `CODE_OF_CONDUCT.md` at the repository root that names the Contributor Covenant version 2.1, links to its canonical URL, states that the project adopts it, and names that contact method as the only channel for conduct reports. If the contact method is an email address, it SHALL need the Human_Operator's approval under Requirement 1 criterion 11.
2. IF the Human_Operator has not supplied a conduct contact method, THEN THE Publishing_Procedure SHALL stop before creating `CODE_OF_CONDUCT.md`, request the value, and leave the Commit_Set without `CODE_OF_CONDUCT.md`.
3. THE Publishing_Procedure SHALL replace only the body of the Reporting section of `SECURITY.md`. The new body SHALL contain a link to `https://github.com/ousssamarahmani/<name>/security/advisories/new` and a statement that vulnerabilities must not be reported in public issues, pull requests or discussions. `git diff SECURITY.md` SHALL show no changed line outside the Reporting section.
4. WHEN the Remote_Repository exists, THE Publishing_Procedure SHALL run `gh api -X PUT repos/ousssamarahmani/<name>/private-vulnerability-reporting` and record the exact command and the HTTP response status. Private vulnerability reporting counts as enabled only when the status is 204.
5. THE Publishing_Procedure SHALL change `CONTRIBUTING.md` only by adding or correcting hyperlinks to files that exist in the Commit_Set. `git diff CONTRIBUTING.md` SHALL show no removed or added line other than a line whose only change is a hyperlink target or link text.
6. THE Publishing_Procedure SHALL create `.github/ISSUE_TEMPLATE/bug_report.yml` and `.github/ISSUE_TEMPLATE/feature_request.yml` as GitHub issue forms. Each form SHALL have a non-empty `name`, a non-empty `description`, and a `body` that uses only the field types `markdown`, `input`, `textarea`, `dropdown` and `checkboxes`. The bug report SHALL contain required fields for steps to reproduce, expected behavior, actual behavior and environment (OS, Node version, pnpm version). The feature request SHALL contain required fields for the problem and the proposed change. THE Publishing_Procedure SHALL also create `.github/ISSUE_TEMPLATE/config.yml`.
7. THE `.github/ISSUE_TEMPLATE/config.yml` file SHALL set `blank_issues_enabled: false` and SHALL contain exactly one contact link, which points to `https://github.com/ousssamarahmani/<name>/security/advisories/new` and is labeled as the channel for security reports.
8. THE Publishing_Procedure SHALL create `.github/pull_request_template.md` with a field for the task ID, a field for the branch name in the form `task/<ID>-short-name`, and one unchecked checklist item for each of the eight report parts from `.kiro/steering/agent-workflow.md`, in this order: objective, files, decisions, tests executed, test results, remaining issues, blockers, next task.
9. THE Publishing_Procedure SHALL create or modify files under `.github/` only when the `devops` role or the Human_Operator performs the change, as `docs/agents/team.md` §3 requires. Any other role SHALL file a handoff request to `devops` and leave `.github/` unchanged.
10. THE Publishing_Procedure SHALL create no file under `.github/workflows/`, because CI remains task P0-06.
11. IF the private vulnerability reporting request returns any status other than 204 (for example because the token lacks admin permission on the Remote_Repository), THEN THE Publishing_Procedure SHALL report the status and response body to the Human_Operator. It SHALL also give the Human_Operator written steps to enable private vulnerability reporting under Settings → Code security, and SHALL record the reporting channel as not enabled in the launch report until the Human_Operator confirms it is on.
12. WHEN the first push completes, THE Publishing_Procedure SHALL run `gh api repos/ousssamarahmani/<name>/community/profile`, record the output, and confirm that the code of conduct, contributing guide, license, security policy, issue templates and pull request template are each reported as present.
13. IF the community profile output from criterion 12 reports the code of conduct as absent because it was adopted by reference, THEN THE Publishing_Procedure SHALL report this to the Human_Operator. It SHALL then offer two options: replace `CODE_OF_CONDUCT.md` with the unmodified Contributor Covenant 2.1 text plus the contact method, or keep the by-reference file and accept that GitHub does not recognize it. It SHALL change no file until the Human_Operator records a choice.

### Requirement 8: Brand assets

**User Story:** As the Human_Operator, I want the Lathe logo and a social preview image stored at fixed paths in the repository, so that the README header and link previews show Lathe's identity.

#### Acceptance Criteria

1. IF the Logo_File does not exist at `docs/assets/brand/lathe-logo.png`, or exists but cannot be read as a PNG image with a width and height of at least 1 px each, THEN THE Publishing_Procedure SHALL stop before writing the README header and before creating the Social_Preview_Image, ask the Human_Operator to save the logo to that path, and leave the README unchanged.
2. THE Publishing_Procedure SHALL store the Social_Preview_Image at `docs/assets/brand/lathe-social-preview.png` as a PNG file with a width of exactly 1280 px, a height of exactly 640 px and a file size below 1,000,000 bytes.
3. THE Social_Preview_Image SHALL contain the Logo_File artwork, the word "Lathe" and the same tagline text used in the README header on a dark background, with every non-background pixel at least 40 px from each of the four edges.
4. WHEN the Social_Preview_Image is created, THE Publishing_Procedure SHALL record in the launch report (`docs/reports/github-repository-launch-<role>.md`) the exact command that was run and its output showing the width in px, the height in px and the file size in bytes.
5. IF the recorded width is not 1280 px, the recorded height is not 640 px, or the recorded file size is 1,000,000 bytes or more, THEN THE Publishing_Procedure SHALL keep the Social_Preview_Image out of every commit, report the recorded values to the Human_Operator, and stop until a replacement image passes criterion 2.
6. IF the Publishing_Procedure cannot produce the Social_Preview_Image with tools already installed on the host and dependencies already declared in the repository, THEN THE Publishing_Procedure SHALL stop, ask the Human_Operator either to approve one named tool or dependency or to supply the image at `docs/assets/brand/lathe-social-preview.png`, and add no dependency to any `package.json` before that approval.
7. WHEN the Social_Preview_Image passes criterion 2, THE Publishing_Procedure SHALL ask the Human_Operator to confirm by visual inspection that the image meets criterion 3, and SHALL record the yes or no answer in the launch report before the image is committed.
8. WHEN the first push completes, THE Publishing_Procedure SHALL give the Human_Operator written steps to upload the Social_Preview_Image through Settings → General → Social preview on the Remote_Repository.
9. WHEN the Human_Operator reports the upload as done, THE Publishing_Procedure SHALL record the confirmation in the launch report as either the path of a screenshot saved under `docs/assets/brand/` or the Human_Operator's written confirmation with its date.
10. IF the Human_Operator has not reported the upload as done when the launch report is written, THEN THE Publishing_Procedure SHALL mark the social preview upload as "pending, manual" in the launch report's remaining-issues section and SHALL NOT describe the upload as completed.
11. THE Publishing_Procedure SHALL document in the launch report that the repository avatar is the `ousssamarahmani` account profile picture and that changing the avatar is outside the Remote_Repository settings.

### Requirement 9: Post-publish verification

**User Story:** As the Human_Operator, I want evidence that the published repository matches what was approved, so that I can trust the launch is complete.

#### Acceptance Criteria

1. WHEN the first push completes, THE Publishing_Procedure SHALL run `gh repo view ousssamarahmani/<name> --json visibility,description,homepageUrl,repositoryTopics,licenseInfo,defaultBranchRef` and record the exact command, its exit code and its full output.
2. WHEN the output from criterion 1 is recorded, THE Publishing_Procedure SHALL confirm all of the following from that output: `visibility` is `PUBLIC`; `defaultBranchRef.name` is `main`; the description matches the text approved under Requirement 3 character for character; `homepageUrl` is empty; the topic names, compared as sets with order ignored, have the same members and the same count as the Topic_List; and `licenseInfo.key` is `mit`.
3. IF `licenseInfo` is null or `licenseInfo.key` is not `mit` in the output from criterion 1, THEN THE Publishing_Procedure SHALL re-run the criterion 1 command up to 10 more times at 30-second intervals, record each output, and treat the license check as failed only if `licenseInfo.key` is still not `mit` after the last attempt.
4. WHEN the first push completes, THE Publishing_Procedure SHALL run `gh api repos/ousssamarahmani/<name>/contents/.kiro` and confirm that the command exits with code 0 and that its output lists `agents` and `steering` as directories at `/.kiro` in the Remote_Repository root.
5. WHEN the first push completes and before the launch report is written, THE Publishing_Procedure SHALL record the output of `git rev-parse HEAD`, `git rev-parse origin/main` and `git status --porcelain`, and SHALL confirm that the two hashes are equal and that `git status --porcelain` returns empty output.
6. WHEN the first push completes, THE Publishing_Procedure SHALL request every image referenced by the README (Markdown image syntax and HTML `img` tags) from its Remote_Repository raw URL on branch `main`, and SHALL confirm that each request returns HTTP 200 within 30 seconds, recording the URL and status for each image.
7. WHEN criteria 2, 4, 5 and 6 pass, THE Human_Operator SHALL open the Remote_Repository page and confirm four things: the Logo_File displays in the README header without a broken-image indicator; the name "Lathe" and the approved tagline are visible; every link in the link row opens its target without a 404 page; and the About sidebar shows the approved description, every topic in the Topic_List and the MIT license.
8. IF any check in this requirement fails, after the retries in criterion 3 where they apply, THEN THE Publishing_Procedure SHALL stop and report to the Human_Operator the failed check, its exact command, exit code and output. THE Publishing_Procedure SHALL then make no further push, `gh repo edit` call or settings change on the Remote_Repository until the Human_Operator approves a specific correction.
9. WHEN all checks in criteria 1 to 7 have run, whether they passed or failed, THE Publishing_Procedure SHALL write `docs/reports/github-repository-launch-<role>.md` in the eight-part format from `.kiro/steering/agent-workflow.md`. The report SHALL contain each check's command, exit code, an output excerpt with no secret values, pass or fail result, and the Human_Operator's confirmation from criterion 7.
10. WHEN the launch report is written, THE Publishing_Procedure SHALL ask the Human_Operator to approve publishing it. After that approval, THE Publishing_Procedure SHALL commit only the launch report to `main` in a Conventional Commits message and push it without force flags.
11. WHEN the push of the launch report commit completes, THE Publishing_Procedure SHALL re-run the commands from criterion 5 and report the hashes and `git status --porcelain` output to the Human_Operator. Any difference between the hashes or any non-empty status output counts as a failed check under criterion 8.

### Requirement 10: Scope limits

**User Story:** As the Human_Operator, I want the launch limited to presentation and publishing, so that it does not change the product or claim work that is not done.

#### Acceptance Criteria

1. THE Publishing_Procedure SHALL limit changed paths, meaning paths added, removed or with different content between the baseline manifest (criterion 7) and the tree of `HEAD` at first push, to this list: `README.md`; `LICENSE`; `CODE_OF_CONDUCT.md`; `SECURITY.md`; `CONTRIBUTING.md`; root `package.json`; `.gitignore`; `comments.json`; `.github/ISSUE_TEMPLATE/bug_report.yml`; `.github/ISSUE_TEMPLATE/feature_request.yml`; `.github/ISSUE_TEMPLATE/config.yml`; `.github/pull_request_template.md`; `docs/assets/brand/lathe-logo.png`; `docs/assets/brand/lathe-social-preview.png`; `docs/reports/github-repository-launch-<role>.md`; files under `docs/handoffs/` created by this procedure; and files under `.kiro/specs/github-repository-launch/`.
2. THE Publishing_Procedure SHALL restrict changes to the partially editable files on the criterion 1 list as follows. In `SECURITY.md`, only lines between the Reporting heading and the next heading of the same level change. In `CONTRIBUTING.md`, every changed line adds or changes a Markdown link and no other line changes. In root `package.json`, the only change is one added `license` field with the value `MIT`. In `.gitignore`, the only change is one added line `comments.json`, and only when the Human_Operator chose to ignore that file. `comments.json` is either byte-identical to the baseline or absent from `HEAD`, as the Human_Operator's recorded decision requires. Every path not on the criterion 1 list, including `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `TASKLIST.md`, `ROADMAP.md`, `AGENTS.md`, `pnpm-lock.yaml`, `.env.example`, `docs/adr/`, `docs/architecture/`, `docs/agents/`, `.kiro/steering/`, `.kiro/agents/`, `.kiro/hooks/`, `packages/` and `infra/`, has the same content hash in `HEAD` as in the baseline manifest.
3. THE Publishing_Procedure SHALL make no Remote_Repository settings changes other than these: public visibility at creation (Requirement 3), description, topics, empty homepage, default branch `main`, enabling private vulnerability reporting (Requirement 7), and the social preview upload by the Human_Operator (Requirement 8). THE Publishing_Procedure SHALL create no file under `.github/workflows/`, and no release, git tag, GitHub Pages site, website, GitHub App installation, webhook or deploy key.
4. THE Publishing_Procedure SHALL include no code, text, image, badge or layout code from the `warpdotdev/warp` repository or any other third-party repository, with two exceptions: the unmodified MIT License text in `LICENSE`, and the Contributor Covenant version 2.1 adopted by reference in `CODE_OF_CONDUCT.md`. The launch report SHALL list each of these two exceptions with its source.
5. THE Publishing_Procedure SHALL not star, watch, fork or follow any repository or account. It SHALL add no badge beyond those permitted by Requirement 5 criterion 15, and no star, follower, download, user or benchmark count in any file in the criterion 1 list.
6. THE Publishing_Procedure SHALL perform no merge, pull request creation, deploy, visibility change after creation, repository transfer, branch protection change or collaborator change, and SHALL push no ref other than `main`.
7. WHEN the Publishing_Procedure starts, before any file change, it SHALL record a baseline manifest in the launch report. The manifest lists every path returned by `git ls-files --others --cached --exclude-standard`, each with a blob id stored in the Local_Repository by `git hash-object -w <path>`.
8. WHEN the Commit_Set is committed, and before the first push, THE Publishing_Procedure SHALL compare the baseline manifest with the output of `git ls-tree -r HEAD`. It SHALL record every changed path in the launch report, and for each partially editable file in criterion 2 it SHALL record the output of `git diff <baseline-blob-id> HEAD:<path>`. IF any changed path is outside the criterion 1 list, or any recorded diff breaks criterion 2 (for example, a `pnpm-lock.yaml` change caused by running the Quickstart commands), THEN THE Publishing_Procedure SHALL stop before the push and report each offending path and its diff to the Human_Operator.
9. WHEN the first push completes, THE Publishing_Procedure SHALL record in the launch report the output of each check below. IF any check returns a result other than the expected one, THEN THE Publishing_Procedure SHALL report it under Requirement 9 criterion 8.

   | Command | Expected result |
   |---|---|
   | `git ls-remote --tags origin` | no tags |
   | `gh release list --repo ousssamarahmani/<name>` | no releases |
   | `gh workflow list --repo ousssamarahmani/<name>` | no workflows |
   | `gh api repos/ousssamarahmani/<name>/hooks` | empty list |
   | `gh api repos/ousssamarahmani/<name>/keys` | empty list |
   | `gh api repos/ousssamarahmani/<name>/collaborators` | only `ousssamarahmani` |
   | `gh api repos/ousssamarahmani/<name>/pages` | no Pages site |
   | `gh api repos/ousssamarahmani/<name>/branches/main/protection` | no branch protection |
