import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// /background-removal/ — MODNet portrait matting in the browser through ONNX
// Runtime Web. These tests pin the pipeline, not the matting quality: the only
// committed fixture (tests/fixtures/tiny.png) is not a photo of a person, and
// MODNet removes all of it. Quality is judged by eye on a real portrait.
//
// Everything the page loads is same-origin, so the tests need no network beyond
// the preview server.

// 同 encode-matrix.spec.ts 的 base 口径（config 无 baseURL）
const base =
  process.env.BENCH_BASE ||
  (process.env.BENCH_LIVE ? 'https://lab.pixkeep.app' : 'http://localhost:4322');

const FIXTURE = 'tests/fixtures/tiny.png';

/** Width/height from a PNG's IHDR chunk. */
function pngDims(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Load the page, pick the fixture, click Run, wait for the outcome; returns it plus what the page logged.
 * With `needsWorkerCanvas`, skips when the browser has no OffscreenCanvas at all.
 */
async function runFixture(page: import('@playwright/test').Page, query: string, { needsWorkerCanvas = false } = {}) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(`${base}/background-removal/?${query}`);
  if (needsWorkerCanvas) {
    // Playwright's WebKit on Windows has no OffscreenCanvas, in a worker or
    // anywhere. Real Safari has it; that is not what this build tells us.
    test.skip(
      await page.evaluate(() => typeof OffscreenCanvas === 'undefined'),
      'this browser build has no OffscreenCanvas (the worker decodes the photo with one)',
    );
  }
  await page.setInputFiles('#file', FIXTURE);
  // Click rather than ?autorun=1: the click auto-waits until the page has
  // decoded the photo and enabled the button.
  await page.click('#run');
  await page.waitForFunction(() => window.__bgRemovalResult, null, { timeout: 8 * 60_000 });
  const result = await page.evaluate(() => window.__bgRemovalResult);
  return { result, pageErrors, consoleErrors };
}

test('page is served as a noindex demo', async ({ page }) => {
  const res = await page.goto(`${base}/background-removal/`);
  expect(res?.status()).toBe(200);

  // demo stage: robots meta, no canonical (the landing page uses the same setting)
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  // the page offers nothing to click until a photo is chosen
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('#result-card')).toBeHidden();
});

for (const { label, query } of [
  // The CPU-only runtime build — what the default WASM backend downloads.
  { label: 'CPU-only runtime build', query: 'backend=wasm&runtime=cpu' },
  // The WebGPU-capable build, which the WebGPU backend downloads. Its CPU
  // provider has to work too: that is where "auto" lands when the WebGPU
  // session cannot be created.
  { label: 'WebGPU-capable runtime build', query: 'backend=wasm&runtime=webgpu' },
]) {
  test(`WASM run on the ${label}: cuts out, keeps size, exports PNG`, async ({ page }) => {
    const { result, pageErrors, consoleErrors } = await runFixture(page, query, { needsWorkerCanvas: true });

    expect(result.error).toBeUndefined();
    expect(result.run.backend).toBe('wasm');
    expect(result.run.model.dtype).toBe('q8');
    expect(result.run.model.bytes).toBe(6632188); // third_party/modnet/NOTICE

    // The cut-out has the photo's full resolution.
    const dims = pngDims(fs.readFileSync(FIXTURE));
    expect(result.run.input).toEqual(dims);

    // The network ran: a photo with no person in it comes out fully removed.
    expect(result.run.keptPct).toBe(0);
    expect(result.run.removedPct).toBe(100);
    expect(result.run.softPct).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page.locator('#status')).toContainText('done: WASM');
    await expect(page.locator('#result-card')).toBeVisible();
    await expect(page.locator('#file-note')).toContainText(`${dims.width}×${dims.height}`);

    // Download PNG → a real PNG, same size, named after the photo
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    expect(download.suggestedFilename()).toBe('tiny-no-bg.png');
    expect(pngDims(fs.readFileSync((await download.path())!))).toEqual(dims);
  });
}

test('a failed model download is reported, not swallowed', async ({ page }) => {
  await page.route('**/models/modnet/**', (route) => route.abort('failed'));

  const { result, pageErrors } = await runFixture(page, 'backend=wasm');

  expect(typeof result.error).toBe('string');
  expect(result.error.length).toBeGreaterThan(0);
  expect(result.run).toBeUndefined();
  expect(pageErrors).toEqual([]);
  await expect(page.locator('#status')).toContainText('failed:');
  await expect(page.locator('#result-card')).toBeHidden();
});

test('a failed runtime download is reported, not swallowed', async ({ page }) => {
  await page.route('**/ort/**', (route) => route.abort('failed'));

  const { result, pageErrors } = await runFixture(page, 'backend=wasm');

  expect(typeof result.error).toBe('string');
  expect(result.error.length).toBeGreaterThan(0);
  expect(result.run).toBeUndefined();
  expect(pageErrors).toEqual([]);
  await expect(page.locator('#status')).toContainText('failed:');
});
