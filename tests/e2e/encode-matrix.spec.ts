// Encode-matrix driver: opens the bench page with ?samples=…&autorun=1, waits
// for window.__benchEncodeResult, writes the JSON to tmp/.
//
//   npx playwright test                          # local build, chromium+firefox+webkit
//   npx playwright test --project=chromium       # one engine
//   BENCH_LIVE=1 npx playwright test --project=webkit   # against lab.pixkeep.app
//   BENCH_SAMPLES=graphic-text …                 # subset for a smoke run
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const samples = process.env.BENCH_SAMPLES || 'all';
const base = process.env.BENCH_LIVE ? 'https://lab.pixkeep.app' : 'http://localhost:4322';

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
