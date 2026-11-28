import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Workspace shell e2e (P9-02) against a production build of the Workspace.
 *
 * The Engine is the fixture `e2e/fake-engine.mjs` (C4 routes the shell uses, same
 * status codes and error shape). The run against the real Engine waits for P3-04;
 * set `LATHE_E2E_ENGINE_URL` (plus `LATHE_E2E_PASSWORD`) to point at a real Engine
 * instead, and no fake is started.
 *
 * `LATHE_ENGINE_URL` must be set at build time because Next.js bakes the `/auth`
 * and `/v1` proxy rules into the build.
 */
const WORKSPACE_PORT = 3298;
const FAKE_ENGINE_PORT = 3299;
const WORKSPACE = `http://localhost:${WORKSPACE_PORT}`;
const realEngine = process.env['LATHE_E2E_ENGINE_URL'];

process.env['LATHE_E2E_PASSWORD'] ??= randomBytes(18).toString('base64url');
const engineUrl = realEngine ?? `http://127.0.0.1:${FAKE_ENGINE_PORT}`;

const workspace = {
  command: `pnpm exec next build --webpack && pnpm exec next start -p ${WORKSPACE_PORT}`,
  url: `${WORKSPACE}/sign-in`,
  reuseExistingServer: false,
  timeout: 240_000,
  env: { LATHE_ENGINE_URL: engineUrl },
};

const fakeEngine = {
  command: 'node e2e/fake-engine.mjs',
  port: FAKE_ENGINE_PORT,
  reuseExistingServer: false,
  timeout: 30_000,
  env: {
    FAKE_ENGINE_PORT: String(FAKE_ENGINE_PORT),
    FAKE_ENGINE_PASSWORD: process.env['LATHE_E2E_PASSWORD'],
    FAKE_ENGINE_TRUSTED_ORIGIN: WORKSPACE,
  },
};

export default defineConfig({
  testDir: './e2e',
  // Outside the repository, so run artifacts are never committed.
  outputDir: join(tmpdir(), 'lathe-e2e-workspace'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: WORKSPACE, trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } },
    },
  ],
  webServer: realEngine ? [workspace] : [fakeEngine, workspace],
});
