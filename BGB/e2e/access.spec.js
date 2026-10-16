import { expect, test } from '@playwright/test';
import { ACCOUNTS, expectNoSideScroll, menuEntries, signIn, signOut } from './helpers.js';

// Specs #3, #4, #28, #29, #41, #43

test('#4 #28 signs in, shows the user, and signs out', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByRole('button', { name: 'User menu' })).toContainText('Col. Rahman');
  await expectNoSideScroll(page);
  await signOut(page);
  // After signing out the app is closed again
  await page.goto('/incidents');
  await expect(page).toHaveURL(/\/login/);
});

test('#29 a wrong password gets one generic message and no access', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill('hq_admin');
  await page.locator('input[autocomplete="current-password"]').fill('Wrong@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// Default permissions (CLAUDE.md §5): what each role's main menu offers
const EXPECTED = {
  admin: { has: ['Dashboard', 'Incidents', 'New incident', 'GIS map', 'Analytics', 'Reports', 'Audit trail', 'Administration'], not: [] },
  sector: { has: ['Dashboard', 'Incidents', 'New incident', 'GIS map', 'Analytics', 'Reports'], not: ['Audit trail', 'Administration'] },
  operator: { has: ['Dashboard', 'Incidents', 'New incident', 'GIS map'], not: ['Analytics', 'Reports', 'Audit trail', 'Administration'] },
  verifier: { has: ['Dashboard', 'Incidents', 'GIS map', 'Analytics', 'Reports'], not: ['New incident', 'Audit trail', 'Administration'] },
  auditor: { has: ['Dashboard', 'Incidents', 'Analytics', 'Reports', 'Audit trail'], not: ['New incident', 'GIS map', 'Administration'] },
};

for (const who of Object.keys(ACCOUNTS)) {
  test(`#3 role-based access: ${ACCOUNTS[who][0]} sees only the permitted pages`, async ({ page }) => {
    await signIn(page, who);
    const entries = await menuEntries(page);
    for (const e of EXPECTED[who].has) expect(entries, `menu of ${who}`).toContain(e);
    for (const e of EXPECTED[who].not) expect(entries, `menu of ${who}`).not.toContain(e);
    // A page outside the role is refused even when typed in the address bar
    if (who !== 'admin') {
      await page.goto('/admin');
      await expect(page).not.toHaveURL(/\/admin/);
    }
  });
}

test('#43 switches the interface to Bangla and back', async ({ page }) => {
  await signIn(page, 'admin');
  await page.locator('button[lang="bn"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByText('ড্যাশবোর্ড').first()).toBeAttached();
  await expectNoSideScroll(page);
  await page.locator('button[lang="en"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
