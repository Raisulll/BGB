import { expect, test } from '@playwright/test';
import { expectNoSideScroll, signIn } from './helpers.js';

// Specs #8, #18 — the maps (components/map/Leaflet.jsx): markers, hover tooltip, click popup with
// links, zoom controls, the incident's own map; no script errors on the way.

test('#8 #18 a map location opens its tooltip and popup and zooms in', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, 'admin');
  await page.goto('/map');
  await expect(page.locator('.map-location').first()).toBeVisible();
  // Wait for the opening flight to the incidents to finish
  await page.waitForTimeout(2000);
  // A location whose marker isn't covered by a neighbouring one
  await page.locator('.leaflet-container').scrollIntoViewIfNeeded();
  const free = await page.locator('.map-location').evaluateAll((els) =>
    els.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
  );
  expect(free, 'an uncovered location marker').toBeGreaterThanOrEqual(0);
  const marker = page.locator('.map-location').nth(free);

  if (!test.info().project.use.isMobile) {
    await marker.hover();
    await expect(page.locator('.leaflet-tooltip').getByText('Recent incidents (last 2)')).toBeVisible();
  }

  await marker.click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup.getByText('Last 2 incidents')).toBeVisible();
  await expect(popup.getByRole('link', { name: /Show all \d+ incidents/ })).toBeVisible();
  // Zoomed in: the zoom and back-to-map buttons appear
  await expect(page.getByRole('button', { name: 'Back to the whole map' })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in' }).click();

  // The popup's link opens the incident inside the app
  await popup.getByRole('link', { name: /View details/ }).first().click();
  await page.waitForURL(/\/incidents\/BIRDS-\d{4}-\d{4}$/);
  // The incident's own map, with its marker
  await expect(page.locator('.leaflet-container .leaflet-marker-icon').first()).toBeVisible();
  await expectNoSideScroll(page);
  // Back on the map: the same view, with the location's popup open again
  await page.goBack();
  await expect(page.locator('.leaflet-popup').getByText('Last 2 incidents')).toBeVisible();
  expect(errors, 'script errors').toEqual([]);
});
