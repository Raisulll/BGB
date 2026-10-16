// Records the browser versions and the screen of each configuration the browser tests ran on
// (documents 09 and 10): e2e-results/browsers.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, firefox } from '@playwright/test';
import config from '../playwright.config.js';

const version = async (type, options) => {
  const browser = await type.launch(options);
  const v = browser.version();
  await browser.close();
  return v;
};

const versions = {
  chrome: await version(chromium, { channel: 'chrome' }),
  msedge: await version(chromium, { channel: 'msedge' }),
  firefox: await version(firefox),
  projects: config.projects.map(({ name, use }) => ({
    name,
    channel: use.channel || null,
    viewport: use.viewport,
    isMobile: Boolean(use.isMobile),
    hasTouch: Boolean(use.hasTouch),
    deviceScaleFactor: use.deviceScaleFactor || 1,
  })),
};
mkdirSync('e2e-results', { recursive: true });
writeFileSync('e2e-results/browsers.json', JSON.stringify(versions, null, 2));
console.log(versions);
