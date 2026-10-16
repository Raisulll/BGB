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
  // Start from a signed-out browser (the session lives in the refresh cookie; /login redirects a signed-in user)
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  const response = page.waitForResponse((r) => r.url().endsWith('/auth/login'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const r = await response;
  expect(r.status(), `sign-in of ${username}: ${await r.text().catch(() => '')}`).toBe(200);
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
  const nav = page.getByRole('complementary', { name: 'Main navigation' }).getByRole('navigation');
  await expect(nav).toBeVisible();
  // Link names without unread counts ("Messages, 3 unread" -> "Messages")
  return (await nav.getByRole('link').evaluateAll((links) => links.map((a) => a.getAttribute('aria-label') || a.textContent)))
    .map((t) => t.split(',')[0].replace(/\d+$/, '').trim())
    .filter(Boolean);
}

/** Runs a workflow action from the incident page; return and reject ask for a reason in a dialog. */
export async function workflowAction(page, action, reason) {
  await page.getByRole('button', { name: action, exact: true }).first().click();
  if (!reason) return;
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('textarea').fill(reason);
  await dialog.getByRole('button', { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}
