import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoRelativePath, Slug, type Finding } from '@lathe/shared-contracts';
import { z } from 'zod';
import type { Gate, GateContext, GateOutcome } from '../gate.js';
import { runCommand, tail, type CommandRunner } from './process.js';

export const SECURITY_RULES = {
  secret: 'secret.',
  auditPrefix: 'audit.',
} as const;

/** gitleaks exit code for "leaks found". Chosen so that its generic failure code 1 means error. */
const LEAKS_EXIT = 2;
const GITLEAKS_TIMEOUT_MS = 120_000;
const AUDIT_TIMEOUT_MS = 300_000;

export interface SecurityGateOptions {
  /** Path or name of the gitleaks binary. Defaults to `LATHE_GITLEAKS`, then `gitleaks` on PATH. */
  readonly gitleaksBin?: string;
  readonly run?: CommandRunner;
}

const result = (
  status: GateOutcome['status'],
  summary: string,
  findings: Finding[],
): GateOutcome => ({ status, summary: summary.slice(0, 500), findings, artifacts: [] });

const ruleSlug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .slice(0, 80);

interface Located {
  readonly path: string;
  readonly line: number;
}

/** Maps each line of a unified diff (1-based index) to the file and new-file line it adds. */
export function mapPatchLines(patch: string): Map<number, Located> {
  const map = new Map<number, Located>();
  let path: string | null = null;
  let newLine = 0;
  patch.split('\n').forEach((text, i) => {
    if (text.startsWith('+++ ')) {
      const p = text.slice(4).trim();
      path = p === '/dev/null' ? null : p.replace(/^b\//, '');
      return;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      newLine = Number(hunk[1]);
      return;
    }
    if (text.startsWith('-') || text.startsWith('\\')) return;
    if (text.startsWith('+') && path !== null) map.set(i + 1, { path, line: newLine });
    newLine += 1;
  });
  return map;
}

/** One gitleaks report entry. Only these fields are read; `Secret` and `Match` are never touched. */
const LeakEntry = z.object({
  RuleID: z.string().min(1),
  StartLine: z.number().int().min(0).default(0),
});
const LeakReport = z.array(LeakEntry);

async function scanSecrets(
  ctx: GateContext,
  bin: string,
  run: CommandRunner,
): Promise<{ status: 'passed' | 'failed' | 'error'; message: string; findings: Finding[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'lathe-secrets-'));
  try {
    const patchFile = join(dir, 'agent.patch');
    const reportFile = join(dir, 'leaks.json');
    const patch = ctx.patch ?? '';
    await writeFile(patchFile, patch, 'utf8');
    const r = await run({
      cmd: bin,
      args: [
        'detect',
        '--no-git',
        '--source',
        patchFile,
        '--report-format',
        'json',
        '--report-path',
        reportFile,
        '--redact',
        '--no-banner',
        '--exit-code',
        String(LEAKS_EXIT),
        '--log-level',
        'error',
      ],
      cwd: dir,
      timeoutMs: GITLEAKS_TIMEOUT_MS,
    });
    if (r.spawnError !== undefined)
      return {
        status: 'error',
        message: `secret scan unavailable: gitleaks could not start (${r.spawnError})`,
        findings: [],
      };
    if (r.timedOut) return { status: 'error', message: 'secret scan timed out', findings: [] };
    if (r.exitCode !== 0 && r.exitCode !== LEAKS_EXIT)
      return {
        status: 'error',
        message: `secret scan unavailable: gitleaks exited with ${String(r.exitCode)} (${tail(
          r.output,
          200,
        )})`,
        findings: [],
      };

    let entries: z.infer<typeof LeakReport> = [];
    let readable = true;
    try {
      const parsed = LeakReport.safeParse(
        JSON.parse(await readFile(reportFile, 'utf8')) as unknown,
      );
      if (parsed.success) entries = parsed.data;
      else readable = false;
    } catch {
      readable = false;
    }
    if (r.exitCode === LEAKS_EXIT && !readable)
      return {
        status: 'error',
        message: 'gitleaks reported leaks but its report is unreadable',
        findings: [],
      };
    if (r.exitCode === LEAKS_EXIT && entries.length === 0)
      return {
        status: 'error',
        message: 'gitleaks reported leaks but its report lists none',
        findings: [],
      };

    const lines = mapPatchLines(patch);
    const findings: Finding[] = entries.map((e) => {
      const at = lines.get(e.StartLine);
      const path = at ? RepoRelativePath.safeParse(at.path) : null;
      const rule = ruleSlug(e.RuleID);
      return {
        ruleId: `${SECURITY_RULES.secret}${rule}`,
        severity: 'critical',
        message: `Possible secret matched rule ${rule}. The value is not recorded; rotate it if real.`,
        ...(at && path?.success ? { path: path.data, line: Math.max(1, at.line) } : {}),
      };
    });
    return findings.length > 0
      ? { status: 'failed', message: `${findings.length} possible secret(s)`, findings }
      : { status: 'passed', message: 'no secrets found', findings: [] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const Advisory = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  module_name: z.string().default('unknown'),
  severity: z.string(),
  title: z.string().default(''),
});
const AuditReport = z.object({
  advisories: z.record(z.string(), Advisory).optional(),
  error: z.unknown().optional(),
  metadata: z
    .object({
      vulnerabilities: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
});

/** Takes the JSON object out of mixed stdout and stderr text. */
function extractJson(text: string): unknown {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a === -1 || b <= a) return undefined;
  try {
    return JSON.parse(text.slice(a, b + 1)) as unknown;
  } catch {
    return undefined;
  }
}

async function auditDependencies(
  ctx: GateContext,
  run: CommandRunner,
): Promise<{ status: 'passed' | 'failed' | 'error'; message: string; findings: Finding[] }> {
  const err = (message: string) => ({ status: 'error' as const, message, findings: [] });
  if (!Slug.safeParse(ctx.app).success) return err(`invalid app name ${JSON.stringify(ctx.app)}`);
  const cwd = join(ctx.worktree, 'apps', ctx.app);
  if (!(await stat(cwd).catch(() => null))?.isDirectory())
    return err(`app directory apps/${ctx.app} not found in the worktree`);

  const r = await run({
    cmd: 'pnpm',
    args: ['audit', '--audit-level', 'high', '--json'],
    cwd,
    timeoutMs: AUDIT_TIMEOUT_MS,
  });
  if (r.spawnError !== undefined) return err(`dependency audit could not start: ${r.spawnError}`);
  if (r.timedOut) return err('dependency audit timed out');

  const parsed = AuditReport.safeParse(extractJson(r.output));
  if (!parsed.success)
    return err(
      `dependency audit output unreadable (exit ${String(r.exitCode)}); treated as error, not pass`,
    );
  const report = parsed.data;
  if (report.error !== undefined && report.error !== null)
    return err('dependency audit failed to complete (registry or network error)');

  const bad = Object.entries(report.advisories ?? {}).filter(([, a]) =>
    ['high', 'critical'].includes(a.severity.toLowerCase()),
  );
  const counts = report.metadata?.vulnerabilities ?? {};
  const counted = (counts['high'] ?? 0) + (counts['critical'] ?? 0);
  if (bad.length > 0 || counted > 0) {
    const findings: Finding[] = bad.slice(0, 200).map(([key, a]) => ({
      ruleId: `${SECURITY_RULES.auditPrefix}${ruleSlug(String(a.id ?? key))}`,
      severity: a.severity.toLowerCase() === 'critical' ? 'critical' : 'high',
      message: `${a.module_name}: ${a.severity} vulnerability. ${a.title}`.slice(0, 2_000),
    }));
    if (findings.length === 0)
      findings.push({
        ruleId: `${SECURITY_RULES.auditPrefix}summary`,
        severity: 'high',
        message: `${counted} high or critical vulnerabilities reported`,
      });
    return {
      status: 'failed',
      message: `${Math.max(bad.length, counted)} high or critical vulnerabilit(ies)`,
      findings,
    };
  }
  if (r.exitCode !== 0)
    return err(`dependency audit exited with ${String(r.exitCode)} without a usable result`);
  if (report.advisories === undefined && report.metadata === undefined)
    return err('dependency audit returned no advisories or metadata; treated as error');
  return { status: 'passed', message: 'no high or critical vulnerabilities', findings: [] };
}

/** Gate 7 (P2-07): gitleaks on the agent patch, then `pnpm audit`. Any tool problem is `error`. */
export function securityGate(options: SecurityGateOptions = {}): Gate {
  const run = options.run ?? runCommand;
  return {
    id: 'security',
    async run(ctx) {
      if (ctx.patch === null)
        return result(
          'error',
          'no patch given (lathe-verify --patch <file>); the security gate cannot pass without one',
          [],
        );
      const bin = options.gitleaksBin ?? process.env['LATHE_GITLEAKS'] ?? 'gitleaks';
      const secrets = await scanSecrets(ctx, bin, run);
      const audit = await auditDependencies(ctx, run);
      const parts = [secrets, audit];
      const findings = parts.flatMap((p) => p.findings);
      const summary = `secrets: ${secrets.message}; audit: ${audit.message}`;
      if (parts.some((p) => p.status === 'error')) return result('error', summary, findings);
      if (parts.some((p) => p.status === 'failed')) return result('failed', summary, findings);
      return result('passed', summary, []);
    },
  };
}
