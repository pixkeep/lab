/**
 * AVIF encoder worker — runs the @jsquash/avif WASM encode off the main thread.
 *
 * Why: mod.encode() is a synchronous WASM call. On non-Chromium engines
 * (Firefox especially) a 12MP photo encode can take minutes; on the main
 * thread that freezes the whole page (the "Compressing..." UI stops
 * responding and any progress feedback is fake). In a worker the main
 * thread stays responsive and the caller gets a normal promise.
 *
 * Deliberately a CLASSIC worker with STATIC imports only — same reasoning
 * as oxipng-worker.js: Vite bundles this whole graph into one IIFE file at
 * build time, so the wasm asset URL is baked in and no import.meta.url
 * resolution happens at runtime. The module is instantiated once and reused
 * across requests (the old main-thread implementation re-initialised it per
 * encode, which wasted a WASM instantiation on every image).
 */
import initAvifEnc from '@jsquash/avif/codec/enc/avif_enc.js';
import { initEmscriptenModule } from '@jsquash/avif/utils.js';
import { defaultOptions } from '@jsquash/avif/meta.js';

let ready = null;
async function ensureInit() {
  if (!ready) ready = initEmscriptenModule(initAvifEnc);
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
    if (!output) throw new Error('AVIF encode returned null.');
    self.postMessage({ id, result: output.buffer }, [output.buffer]);
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
