/**
 * WebP encoder worker — runs the @jsquash/webp WASM encode off the main thread.
 *
 * Why: WebKit/Safari's canvas.toBlob('image/webp') ignores the quality
 * parameter and encodes (near-)losslessly — a 12MP photo at slider "80%"
 * came out at 20.55 MB vs 3.97 MB source (2026-08-15 macOS regression run,
 * tools.spec.ts 232/275/940). libwebp WASM honors quality and matches
 * Chromium/Firefox output sizes, so WebKit-family browsers route WebP encodes
 * through this worker instead.
 *
 * Same shape as avif-encoder-worker.js: classic worker with static imports
 * only (Vite bundles the whole graph into one IIFE at build time, so the wasm
 * asset URL is baked in and no import.meta.url resolution happens at runtime).
 * The module is instantiated once and reused across requests.
 */
import initWebpEnc from '@jsquash/webp/codec/enc/webp_enc.js';
import { initEmscriptenModule } from '@jsquash/webp/utils.js';
import { defaultOptions } from '@jsquash/webp/meta.js';

let ready = null;
async function ensureInit() {
  if (!ready) ready = initEmscriptenModule(initWebpEnc);
  return ready;
}

self.onmessage = async (e) => {
  const { id, data, width, height, quality } = e.data || {};
  try {
    const mod = await ensureInit();
    const output = mod.encode(
      new Uint8Array(data),
      width,
      height,
      { ...defaultOptions, quality: Math.round(quality * 100) },
    );
    if (!output) throw new Error('WebP encode returned null.');
    self.postMessage({ id, result: output.buffer }, [output.buffer]);
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
