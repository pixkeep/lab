// Encode-matrix driver: opens the bench page with ?samples=…&autorun=1, waits
// for window.__benchEncodeResult, writes the JSON to tmp/.
//
//   npx playwright test                          # local build, chromium+firefox+webkit
//   npx playwright test --project=chromium       # one engine
//   BENCH_LIVE=1 npx playwright test --project=webkit   # against lab.pixkeep.app
//   BENCH_SAMPLES=graphic-text …                 # subset for a smoke run
//   BENCH_MACHINE=e471g BENCH_THERMAL=cool BENCH_REPEAT=r1 …  # run labels → URL
//                                                params → JSON (device.machine /
//                                                run.thermal / run.repeat)
//   BENCH_BASE=http://localhost:4333 …           # custom server — use when 4322 is
//                                                occupied by a dev server (Playwright
//                                                reuses it and results are invalid)
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const samples = process.env.BENCH_SAMPLES || 'all';
const base =
  process.env.BENCH_BASE ||
  (process.env.BENCH_LIVE ? 'https://lab.pixkeep.app' : 'http://localhost:4322');
const labelParams = [
  process.env.BENCH_MACHINE && `machine=${encodeURIComponent(process.env.BENCH_MACHINE)}`,
  process.env.BENCH_THERMAL && `thermal=${encodeURIComponent(process.env.BENCH_THERMAL)}`,
  process.env.BENCH_REPEAT && `repeat=${encodeURIComponent(process.env.BENCH_REPEAT)}`,
]
  .filter(Boolean)
  .join('&');

test('encode matrix: native toBlob vs WASM across formats/quality levels', async ({ page }, testInfo) => {
  test.setTimeout(3_000_000); // 50 min — WebKit full-res photos are slow
  await page.goto(
    `${base}/encode-matrix/?samples=${encodeURIComponent(samples)}&autorun=1${labelParams ? `&${labelParams}` : ''}`,
  );
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

test('download button exports the result with run-label filename', async ({ page }, testInfo) => {
  // Regression: the v2 filename suffix referenced `labels`, a variable that
  // only exists inside run() — clicking Download threw a ReferenceError and
  // the button silently did nothing (2026-11-14, e471g manual run hit it).
  // astro build does not typecheck, so this click-path test is the guard.
  const errors: unknown[] = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(`${base}/encode-matrix/?machine=e471g&repeat=r1`);
  await page.setInputFiles('#files', 'tests/fixtures/tiny.png');
  await page.click('#run');
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent?.startsWith('done'),
    null,
    { timeout: 120_000 },
  );

  // parseUa maps each Playwright project's UA to a browser name; the filename
  // mirrors it (headless Chrome reports "…Chrome/…" → chrome).
  const browser = { chromium: 'chrome', firefox: 'firefox', webkit: 'safari' }[testInfo.project.name];
  const download = page.waitForEvent('download');
  await page.click('#download');
  // date suffix = UTC date at click time
  expect((await download).suggestedFilename()).toMatch(new RegExp(`^encode-matrix-${browser}-e471g-r1-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  expect(errors).toEqual([]);
});

test('sample-fetch timeout reports an honest timed-out reason, not "user aborted"', async ({ page }) => {
  // Regression (2026-11-14, e471g manual run): the flat 5-min
  // AbortSignal.timeout fired on a degraded CDN route, and Chrome surfaces
  // that abort as "The user aborted a request." — the user had not. The
  // page must translate the signal's TimeoutError reason into an honest
  // "timed out after N s" in both the retry line and the fatal message.
  const errors: unknown[] = [];
  page.on('pageerror', (e) => errors.push(e));
  // Serve the sample slower than the 500 ms forced budget, every attempt.
  await page.route('**/bench-encode/flower1.png*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ body: 'not-a-real-png', contentType: 'image/png' });
  });
  await page.goto(`${base}/encode-matrix/?samples=flower1&autorun=1&fetchTimeoutMs=500`);
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent?.includes('timed out after'),
    null,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    (t: string) => (document.querySelector('#status')?.textContent || '').startsWith(t),
    'fatal: sample fetch failed: flower1 (timed out after',
    { timeout: 30_000 },
  );
  expect(errors).toEqual([]);
});
