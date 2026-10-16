import { expect } from '@playwright/test';

// Demonstration accounts (CLAUDE.md §6)
export const ACCOUNTS = {
  admin: ['hq_admin', 'Admin@123'],
  sector: ['sector_off', 'Sector@123'],
  operator: ['batt_op', 'Batt@123'],
  verifier: ['verifier', 'Verify@123'],
  auditor: ['auditor', 'Audit@123'],
};

/** Signs in through the login page and waits for the app to open. */
export async function signIn(page, who) {
  const [username, password] = ACCOUNTS[who];
  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Opens the user menu and signs out. */
export async function signOut(page) {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).or(page.getByRole('button', { name: 'Sign out' })).first().click();
  await page.waitForURL(/\/login/);
}

/** The page must not scroll sideways (spec #41). */
export async function expectNoSideScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);
}

/** Main-menu entries the user can see (opens the menu first on narrow screens). */
export async function menuEntries(page) {
  const toggle = page.getByRole('button', { name: 'Toggle navigation' });
  if (await toggle.isVisible()) await toggle.click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();
  return (await nav.getByRole('link').allInnerTexts()).map((t) => t.replace(/\d+$/, '').trim()).filter(Boolean);
}

/** Runs a workflow action from the incident page and confirms it in the dialog. */
export async function workflowAction(page, action, reason) {
  await page.getByRole('button', { name: action, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (reason) await dialog.locator('textarea').fill(reason);
  await dialog.getByRole('button', { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}
