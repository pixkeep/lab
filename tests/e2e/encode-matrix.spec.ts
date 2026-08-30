// Encode-matrix driver: opens the bench page with ?samples=…&autorun=1, waits
// for window.__benchEncodeResult, writes the JSON to tmp/.
//
//   npx playwright test                          # local build, chromium+firefox+webkit
//   npx playwright test --project=chromium       # one engine
//   BENCH_LIVE=1 npx playwright test --project=webkit   # against lab.pixkeep.app
//   BENCH_SAMPLES=graphic-text …                 # subset for a smoke run
//   BENCH_BASE=http://localhost:4333 …           # custom server — use when 4322 is
//                                                occupied by a dev server (Playwright
//                                                reuses it and results are invalid)
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const samples = process.env.BENCH_SAMPLES || 'all';
const base =
  process.env.BENCH_BASE ||
  (process.env.BENCH_LIVE ? 'https://lab.pixkeep.app' : 'http://localhost:4322');

test('encode matrix: native toBlob vs WASM across formats/quality levels', async ({ page }, testInfo) => {
  test.setTimeout(3_000_000); // 50 min — WebKit full-res photos are slow
  await page.goto(`${base}/encode-matrix/?samples=${encodeURIComponent(samples)}&autorun=1`);
  await page.waitForFunction(() => (window as any).__benchEncodeResult, null, { timeout: 3_000_000 });

  const result = await page.evaluate(() => (window as any).__benchEncodeResult);
  mkdirSync('tmp', { recursive: true });
  const label = process.env.BENCH_LABEL || testInfo.project.name;
  const stamp = new Date().toISOString().slice(0, 16).replaceAll(':', '-');
  const out = `tmp/encode-bench-${label}-${stamp}.json`;
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`encode-bench (${label}) → ${out}`);

  const failed = result.results.filter((r: { error?: string }) => r.error);
  expect(failed, `photos failed: ${JSON.stringify(failed)}`).toEqual([]);
});

test('partial format selection renders only the selected formats', async ({ page }) => {
  // Regression: renderPhoto looped all FORMATS and read .sizeFull on an
  // undefined entry when fewer than 3 formats were selected — a JPEG-only
  // run (the default since the format picker) crashed the page (fatal error).
  // Uses a local fixture via the upload path — hermetic, no CDN dependency.
  const errors: unknown[] = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(`${base}/encode-matrix/`);
  await page.setInputFiles('#files', 'tests/fixtures/tiny.png');
  // Default checkbox state: JPEG only.
  await page.click('#run');
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent?.startsWith('done'),
    null,
    { timeout: 120_000 },
  );
  expect(errors).toEqual([]);
  await expect(page.locator('#results .fmt-head h4')).toHaveText(['JPEG']);
  await expect(page.locator('#results .data tbody tr')).toHaveCount(6);
});
