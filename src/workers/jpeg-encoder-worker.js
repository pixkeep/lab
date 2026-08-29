/**
 * JPEG encoder worker — runs MozJPEG (libjpeg fork by Google/Mozilla) via
 * @wasm-codecs/mozjpeg off the main thread.
 *
 * Why: WebKit/Safari's canvas.toBlob('image/jpeg') is measurably less
 * efficient than Chromium/Firefox — re-encoding a 12MP photo at slider "80%"
 * produced 4.1 MB vs a 3.97 MB original estimated at ≈74% quality
 * (2026-08-15 macOS regression run, tools.spec.ts 232/955), which flipped
 * the compressor into "Already optimal" and offered no download. MozJPEG's
 * trellis+optimizeCoding encodes beat browser encoders, restoring usable
 * savings on WebKit-family browsers.
 *
 * We drive the raw Emscripten glue directly (lib/mozjpeg.js) rather than the
 * package wrapper: the wrapper is CJS, uses Node Buffer, and queues encodes —
 * but its `resetModule()` note is real: this emscripten build degrades when
 * the module is reused across encodes (observed 2026-08-15: 3rd sequential
 * encode on one page returned "❌ Failed", 4th+ too, then the page crashed —
 * the same "wasm related problems" the wrapper resets to avoid). So unlike
 * the avif/webp workers this one re-instantiates per request. The wasm URL is
 * baked at build time and served from the browser's HTTP cache, so the extra
 * instantiation cost is a few tens of ms per encode — fine next to the encode
 * itself.
 */
import initMozjpeg from '@wasm-codecs/mozjpeg/lib/mozjpeg.js';
import wasmUrl from '@wasm-codecs/mozjpeg/lib/mozjpeg.wasm?url';

// Matches the package's defaultEncodeOptions (quality overridden per request).
// The embind value object requires every field present (a partial object
// throws "Missing field: ..."). YCbCr = 3.
const ENCODE_OPTIONS = {
  quality: 75,
  baseline: false,
  arithmetic: false,
  progressive: true,
  optimizeCoding: true,
  smoothing: 0,
  colorSpace: 3,
  quantTable: 3,
  trellisMultipass: false,
  trellisOptZero: false,
  trellisOptTable: false,
  trellisLoops: 1,
  autoSubsample: true,
  chromaSubsample: 2,
  separateChromaQuality: false,
  chromaQuality: 75,
};

// Fresh module per request — see header comment (this emscripten build does
// not survive reuse; the glue resolves its own wasm location via locateFile,
// with ?url the asset is emitted to dist/ and the URL baked in).
async function instantiateModule() {
  return initMozjpeg({ locateFile: () => wasmUrl });
}

self.onmessage = async (e) => {
  const { id, data, width, height, quality } = e.data || {};
  try {
    const mod = await instantiateModule();
    const ptr = mod.encode(
      new Uint8Array(data),
      width,
      height,
      4, // RGBA — mozjpeg has no alpha; the caller composites transparency onto white first
      { ...ENCODE_OPTIONS, quality: Math.round(quality * 100) },
    );
    const result = mod.getImage(ptr);
    mod.freeImage(ptr);
    if (!result) throw new Error('MozJPEG encode returned null.');
    // getImage returns a view into the wasm heap — copy before transferring
    // (the shared WebAssembly.Memory itself cannot be transferred).
    const copy = result.slice();
    self.postMessage({ id, result: copy.buffer }, [copy.buffer]);
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
