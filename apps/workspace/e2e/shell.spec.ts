import { expect, test, type Page } from '@playwright/test';

/**
 * Workspace shell (P9-02): sign-in, sign-out, direct URL access without a session,
 * and a role without a permission. Users and orgs are those of the Engine fixture
 * (`fake-engine.mjs`); a real Engine must seed the same two users.
 */
const PASSWORD = process.env['LATHE_E2E_PASSWORD'] ?? '';
const SECTIONS = [
  'Overview',
  'Projects',
  'Specifications',
  'Factory Runs',
  'Agents',
  'Verification',
  'Deliveries',
  'Settings',
];
const PROTECTED = [
  '/overview',
  '/projects',
  '/projects/0d000000-0000-4000-8000-000000000001',
  '/specifications',
  '/runs',
  '/agents',
  '/verification',
  '/deliveries',
  '/settings',
];

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Workspace' });
// Scoped to the page body: Next.js adds its own role="alert" route announcer.
const main = (page: Page) => page.locator('#main');

test('every protected URL redirects to sign-in without a session', async ({ page }) => {
  for (const path of PROTECTED) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in$/);
  }
});

test('a wrong password shows an error and no session', async ({ page }) => {
  await signIn(page, 'ada@lathe.test', `${PASSWORD}-wrong`);
  await expect(main(page).getByRole('alert')).toBeVisible();
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('sign in, pick an org, navigate, switch org, sign out', async ({ page }) => {
  await signIn(page, 'ada@lathe.test');
  await expect(page).toHaveURL(/\/projects$/);

  // New session: no active org yet, so only Settings and a chooser.
  await expect(nav(page).getByRole('link')).toHaveText(['Settings']);
  await expect(page.getByText('Choose an organization').last()).toBeVisible();

  await page.getByLabel('Organization').selectOption({ label: 'Acme' });
  await expect(page.getByTestId('active-role')).toHaveText('owner');
  await expect(nav(page).getByRole('link')).toHaveText(SECTIONS);

  // Real data from the Engine, scoped to Acme.
  await expect(page.getByRole('link', { name: 'Support Desk KB' })).toBeVisible();
  await expect(page.getByText('Team Ops Tasks')).toHaveCount(0);

  // Each section opens and marks itself current.
  for (const label of SECTIONS) {
    await nav(page).getByRole('link', { name: label }).click();
    await expect(nav(page).getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  // Project selector opens the project.
  await page.getByLabel('Project').selectOption({ label: 'Support Desk KB' });
  await expect(page).toHaveURL(/\/projects\/0d000000-0000-4000-8000-000000000001$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Support Desk KB');

  // Switch org: Acme's project is gone, Globex's appears, the role follows.
  await page.getByLabel('Organization').selectOption({ label: 'Globex' });
  await expect(page.getByTestId('active-role')).toHaveText('viewer');
  await expect(main(page).getByRole('alert')).toContainText('Not found');
  await nav(page).getByRole('link', { name: 'Projects' }).click();
  await expect(page.getByRole('link', { name: 'Team Ops Tasks' })).toBeVisible();
  await expect(page.getByText('Support Desk KB')).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('a role without a permission sees no section for it and no data on direct access', async ({
  page,
}) => {
  await signIn(page, 'limited@lathe.test');
  await page.getByLabel('Organization').selectOption({ label: 'Acme' });
  await expect(page.getByTestId('active-role')).toHaveText('limited');
  await expect(nav(page).getByRole('link')).toHaveText(['Factory Runs', 'Settings']);
  await expect(page.getByLabel('Project')).toHaveCount(0);

  for (const path of ['/projects', '/agents', '/projects/0d000000-0000-4000-8000-000000000001']) {
    await page.goto(path);
    await expect(main(page).getByRole('alert'), path).toContainText("You don't have access");
    await expect(page.getByText('Support Desk KB')).toHaveCount(0);
  }

  // The Engine enforces it too, not only the UI.
  const direct = await page.request.get('/v1/projects');
  expect(direct.status()).toBe(403);
});

test('the Engine rejects an org switch to a membership of another user', async ({ page }) => {
  await signIn(page, 'limited@lathe.test');
  await expect(page).toHaveURL(/\/projects$/);
  const r = await page.request.post('/v1/session/active-org', {
    data: { membershipId: '0c000000-0000-4000-8000-000000000002' },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(r.status()).toBe(404);
});
