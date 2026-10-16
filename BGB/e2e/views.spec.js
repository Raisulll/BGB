import { expect, test } from '@playwright/test';
import { expectNoSideScroll, signIn } from './helpers.js';

// Specs #15–#22, #24, #41, #46, #47

test('#15 #16 finds an incident by reference and filters the register', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/incidents');
  await page.getByPlaceholder(/Search by reference/).fill('BIRDS-2026-1070');
  await expect(page.getByText('BIRDS-2026-1070').first()).toBeVisible();
  await expect(page.getByText('BIRDS-2026-1069')).toHaveCount(0);
  await page.getByPlaceholder(/Search by reference/).fill('');
  await page.goto('/incidents?severity=Critical');
  await expect(page.getByText(/Incidents \(\d+\)/).first()).toBeVisible();
  await expectNoSideScroll(page);
});

test('#17 the dashboard shows the key figures', async ({ page }) => {
  await signIn(page, 'admin');
  for (const kpi of ['Total filed', 'Open', 'Verified', 'Approved or closed']) await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expectNoSideScroll(page);
});

test('#8 #18 the GIS map shows incident locations, clusters and heat map', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/map');
  await expect(page.getByText(/\d+ incidents on the map/).first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon, .leaflet-interactive').first()).toBeVisible();
  await page.getByRole('button', { name: 'Clusters' }).click();
  await page.getByRole('button', { name: 'Heatmap' }).click();
  await page.getByRole('button', { name: 'Points' }).click();
  await expectNoSideScroll(page);
});

test('#19 #20 analytics draws its charts and changes the trend period', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/analytics');
  await expect(page.getByText('Total incidents').first()).toBeVisible();
  for (const g of ['day', 'week', 'month', 'quarter', 'year']) await page.getByLabel('Trend granularity').selectOption(g);
  expect(await page.locator('canvas').count()).toBeGreaterThan(2);
  await expectNoSideScroll(page);
});

test('#21 #22 a report is generated and exported to Excel and CSV', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Update report' }).click();
  await expect(page.getByText('CONFIDENTIAL // OPERATIONAL').first()).toBeAttached();
  for (const [button, ext] of [['Export Excel', '.xlsx'], ['CSV', '.csv']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`\\${ext}$`));
  }
  await expectNoSideScroll(page);
});

test('#24 the audit trail verifies its hash chain', async ({ page }) => {
  await signIn(page, 'auditor');
  await page.goto('/audit');
  await page.getByRole('button', { name: 'Verify integrity now' }).click();
  await expect(page.getByText(/Hash chain intact: \d+ entries verified/).first()).toBeVisible();
  await expectNoSideScroll(page);
});

test('#46 #47 the administration module opens its sections', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin');
  for (const tab of ['Users & roles', 'Permissions matrix', 'Categories', 'Org hierarchy', 'Workflow', 'Security & system']) {
    await page.getByRole('tab', { name: tab }).or(page.getByRole('button', { name: tab })).or(page.getByRole('link', { name: tab })).first().click();
    await expectNoSideScroll(page);
  }
});
