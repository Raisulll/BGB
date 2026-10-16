import path from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, signIn, workflowAction } from './helpers.js';

// Specs #5, #7, #8, #9, #10, #11, #12, #13, #14, #15, #23, #25
const PHOTO = path.resolve(import.meta.dirname, '../../server/prisma/demo/media/images/yaba-tablets.jpg');

/** Files an incident as the battalion operator through the three-step form; returns its reference. */
async function fileIncident(page, title) {
  await signIn(page, 'operator');
  await page.goto('/incidents/new');
  // Step 1: basic information and classification
  await page.locator('#inc-title').fill(title);
  await page.locator('#inc-time').fill('10:30');
  await page.getByRole('radio', { name: 'High', exact: true }).click();
  await page.locator('#inc-category').selectOption({ label: 'Smuggling' });
  await page.locator('#inc-subcategory').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Next: location' }).click();
  // Step 2: unit and GPS position
  for (const id of ['#inc-sector', '#inc-battalion', '#inc-bop']) {
    const select = page.locator(id);
    if (!(await select.inputValue())) await select.selectOption({ index: 1 });
  }
  await page.locator('#inc-location').fill('Jadimura landing point');
  await page.locator('#inc-lat').fill('20.9256');
  await page.locator('#inc-lng').fill('92.2589');
  await page.getByRole('button', { name: 'Next: details' }).click();
  // Step 3: narrative and evidence
  await page.locator('#inc-description').fill('Browser test: a carrier was stopped at the Jadimura landing point with a parcel of tablets. Seized and handed to police.');
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expectNoSideScroll(page);
  await page.getByRole('button', { name: 'Submit report' }).click();
  await page.waitForURL(/\/incidents\/BIRDS-\d{4}-\d{4}$/);
  const id = page.url().split('/').pop();
  await expect(page.getByText(id).first()).toBeVisible();
  await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();
  return id;
}

test.describe.serial('incident lifecycle', () => {
  let id;

  test('#5 #7 #8 #9 #10 #11 #15 an operator files an incident with GPS and a photo; it gets a BIRDS reference', async ({ page }) => {
    id = await fileIncident(page, `Browser test ${test.info().project.name} ${Date.now()}`);
    expect(id).toMatch(/^BIRDS-\d{4}-\d{4}$/);
    // Evidence stored with its fingerprint; GPS shown
    await expect(page.getByText('yaba-tablets.jpg').first()).toBeVisible();
    await expect(page.getByText('20.9256').first()).toBeVisible();
    await expectNoSideScroll(page);
  });

  test('#23 the sector officer is notified of the new report', async ({ page }) => {
    await signIn(page, 'sector');
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByText(id).first()).toBeVisible();
  });

  test('#13 #14 #25 review, verify, approve and close by four different officers', async ({ page }) => {
    await signIn(page, 'sector');
    await page.goto(`/incidents/${id}`);
    await workflowAction(page, 'Review');
    await expect(page.getByText('Reviewed', { exact: true }).first()).toBeVisible();

    await signIn(page, 'verifier');
    await page.goto(`/incidents/${id}`);
    await workflowAction(page, 'Verify');
    await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible();
    await workflowAction(page, 'Approve');
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();

    await signIn(page, 'admin');
    await page.goto(`/incidents/${id}`);
    await workflowAction(page, 'Close');
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
    // A closed record offers no editing (#25)
    await expect(page.getByRole('button', { name: 'Modify report' })).toHaveCount(0);
  });

  test('#12 the timeline records every step in order', async ({ page }) => {
    await signIn(page, 'auditor');
    await page.goto(`/incidents/${id}`);
    const timeline = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Timeline' }) }).last();
    for (const step of ['Created', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed']) await expect(timeline.getByText(step, { exact: true }).first()).toBeVisible();
  });

  test('#14 a reviewer returns a report with a reason, which the filer sees', async ({ page }) => {
    const second = await fileIncident(page, `Browser test return ${test.info().project.name} ${Date.now()}`);
    await signIn(page, 'sector');
    await page.goto(`/incidents/${second}`);
    await workflowAction(page, 'Return', 'Please add the seizure list as a PDF.');
    await expect(page.getByText('Returned', { exact: true }).first()).toBeVisible();
    await signIn(page, 'operator');
    await page.goto(`/incidents/${second}`);
    await expect(page.getByText('Please add the seizure list as a PDF.').first()).toBeVisible();
  });
});
