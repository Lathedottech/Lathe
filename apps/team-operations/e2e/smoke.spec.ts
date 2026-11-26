import { expect, test, type Page } from '@playwright/test';
import { SEED_PRINCIPALS } from '../src/server/seed-data';

const password = (): string => {
  const value = process.env['LATHE_TEST_PASSWORD'];
  if (!value) throw new Error('LATHE_TEST_PASSWORD is set by playwright.config.ts');
  return value;
};
const emailOf = (org: 'a' | 'b', role: string): string => {
  const p = SEED_PRINCIPALS.find((x) => x.org === org && x.role === role);
  if (!p) throw new Error(`no seed principal ${org}/${role}`);
  return p.email;
};

async function signInAndChooseOrg(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an organization' })).toBeVisible();
  await page.getByLabel('Active organization').selectOption({ index: 1 });
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
}

test('a page without a session sends the visitor to sign-in', async ({ page }) => {
  await page.goto('/teams');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('a manager creates a team, a project and a task; a member sees them, a guest does not', async ({
  browser,
}) => {
  const stamp = Date.now();
  const manager = await browser.newPage();
  await signInAndChooseOrg(manager, emailOf('a', 'manager'));
  await manager.getByLabel('Team name').fill(`Team ${stamp}`);
  await manager.getByRole('button', { name: 'Create team' }).click();
  await manager.getByRole('link', { name: `Team ${stamp}` }).click();
  await manager.getByLabel('Project name').fill(`Project ${stamp}`);
  await manager.getByRole('button', { name: 'Create project' }).click();
  await manager.getByRole('link', { name: `Project ${stamp}` }).click();
  await expect(manager).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectUrl = manager.url();
  await manager.getByLabel('Task', { exact: true }).fill(`Task ${stamp}`);
  await manager.getByRole('button', { name: 'Add task' }).click();
  await expect(manager.getByText(`Task ${stamp}`)).toBeVisible();

  const member = await browser.newPage();
  await signInAndChooseOrg(member, emailOf('a', 'member'));
  await expect(member.getByRole('button', { name: 'Create team' })).toHaveCount(0);
  await member.goto(projectUrl);
  await expect(member.getByText(`Task ${stamp}`)).toBeVisible();

  const guest = await browser.newPage();
  await signInAndChooseOrg(guest, emailOf('a', 'guest'));
  await expect(guest.getByRole('link', { name: `Team ${stamp}` })).toHaveCount(0);
  await guest.goto(projectUrl);
  await expect(guest.getByText(`Task ${stamp}`)).toHaveCount(0);

  const other = await browser.newPage();
  await signInAndChooseOrg(other, emailOf('b', 'owner'));
  await other.goto(projectUrl);
  await expect(other.getByText('Not found.')).toBeVisible();
});
