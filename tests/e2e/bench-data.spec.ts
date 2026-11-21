import { test, expect } from '@playwright/test';

// /bench-data/ directory index — the crawlable landing page for the raw JSON
// exports (added 2026-11-20: the bare directory URL 404'd, see main-repo
// 404-topic §3 G class). Asserts the page is indexable and lists every file.

// 同 encode-matrix.spec.ts 的 base 口径（config 无 baseURL）
const base =
  process.env.BENCH_BASE ||
  (process.env.BENCH_LIVE ? 'https://lab.pixkeep.app' : 'http://localhost:4322');

test('bench-data index lists all exports and stays indexable', async ({ page }) => {
  const res = await page.goto(`${base}/bench-data/`);
  expect(res?.status()).toBe(200);

  // indexable: canonical present, no noindex
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  // every JSON export is linked
  for (const f of [
    '2026-09-13-windows-chrome-153.json',
    '2026-09-13-windows-edge-153.json',
    '2026-09-13-windows-firefox-155.json',
    '2026-09-13-macos-safari-18.6.json',
    '2026-11-21-linux-chrome-152-r3.json',
  ]) {
    await expect(page.locator(`a[href="/bench-data/${f}"]`)).toHaveCount(1);
  }

  // companion files + backlink to the experiment
  await expect(page.locator('a[href="/bench-data/report.md"]')).toHaveCount(1);
  await expect(page.locator('a[href="/bench-data/README.md"]')).toHaveCount(1);
  await expect(page.locator('a[href="/encode-matrix/"]').first()).toBeVisible();
});
