import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE_URL = 'http://localhost:3000';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// Login
await page.goto(`${BASE_URL}/login`);
await page.fill('input[type="password"]', 'demo');
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.href.includes('login'), { timeout: 10_000 });

async function shoot(route, filename) {
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle');
  // Let React settle any pending renders
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, filename), fullPage: false });
  console.log('screenshot:', filename);
}

await shoot('/',          '01-timer.png');
await shoot('/entries',   '02-entries.png');
await shoot('/dashboard', '03-dashboard.png');
await shoot('/settings',  '04-settings.png');

await browser.close();
console.log('Screenshots saved to docs/screenshots/');
