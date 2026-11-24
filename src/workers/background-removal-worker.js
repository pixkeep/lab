/**
 * Background-removal worker — runs MODNet portrait matting through ONNX
 * Runtime Web (@huggingface/transformers) off the main thread.
 *
 * Everything is served from this origin: the model from /models/, the runtime
 * from /ort/. The lab CSP allows scripts, workers and connections from 'self'
 * (plus cdn.pixkeep.app) only, so both of the library's defaults — models from
 * huggingface.co, runtime from cdn.jsdelivr.net — are switched off below.
 *
 * The runtime's .wasm files are stored gzipped (scripts/pack-ort-wasm.mjs says
 * why). They are inflated here and handed to the runtime as bytes.
 */
import { pipeline, env, RawImage } from '@huggingface/transformers';
import ortManifest from '../lib/ort-manifest.json';

env.allowLocalModels = true; // → env.localModelPath/<model>/…
env.allowRemoteModels = false;
env.localModelPath = '/models/';
// The library's own runtime pre-loader rewrites the runtime's loader script
// into a blob: URL and imports it — the CSP refuses that. We provide the
// runtime ourselves (see ensureRuntime), so the pre-loader stays off.
env.useWasmCache = false;

const ORT = env.backends.onnx.wasm;
// The lab sends no COOP/COEP headers, so the page is never crossOriginIsolated:
// one thread by construction, and no pthread workers to load.
ORT.numThreads = 1;

// Mirrors third_party/modnet/NOTICE.
const MODEL = { id: 'modnet', dtype: 'q8', file: 'model_quantized.onnx', bytes: 6632188 };
// Guard for the worker-side canvases (source, model input, mask, result).
const MAX_PIXELS = 24_000_000;

const isWasm = (bytes) => {
  if (bytes.byteLength < 4) return false;
  const head = new Uint8Array(bytes, 0, 4);
  return head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d;
};

async function fetchBytes(url, onLoaded) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return { bytes: await res.arrayBuffer(), total };

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onLoaded(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: out.buffer, total: total || loaded };
}

async function fetchRuntime(url, onLoaded) {
  const t0 = performance.now();
  const { bytes, total } = await fetchBytes(url, onLoaded);
  const fetchMs = performance.now() - t0;

  // A host that unwraps .gz itself hands us plain wasm — take it as is.
  if (isWasm(bytes)) return { bytes, shippedBytes: total, fetchMs, gunzipMs: 0 };
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot unpack the runtime (no DecompressionStream).');
  }
  const t1 = performance.now();
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const out = await new Response(stream).arrayBuffer();
  return { bytes: out, shippedBytes: total, fetchMs, gunzipMs: performance.now() - t1 };
}

// One runtime per worker: the library initializes it once, on the first
// session. A failed load resets this so a retry starts over.
let runtimeReady = null;
function ensureRuntime(flavor, report) {
  if (!runtimeReady) {
    runtimeReady = (async () => {
      const art = ortManifest.flavors[flavor];
      report({ stage: 'runtime-download', label: art.wasm });
      const { bytes, shippedBytes, fetchMs, gunzipMs } = await fetchRuntime(art.wasm, (loaded, total) =>
        report({ stage: 'runtime-download', loaded, total }),
      );
      ORT.wasmBinary = bytes;
      // With wasmBinary set, the runtime takes the loader script from .mjs and
      // never fetches .wasm.
      ORT.wasmPaths = { mjs: art.mjs, wasm: art.wasm };
      return {
        flavor,
        file: art.wasm,
        rawBytes: art.rawBytes,
        shippedBytes,
        fetchMs,
        gunzipMs,
        version: ortManifest.ortVersion,
      };
    })().catch((err) => {
      runtimeReady = null;
      throw err;
    });
  }
  return runtimeReady;
}

// One pipeline per backend; the second run on a backend is warm.
const pipelines = new Map();
function ensurePipeline(backend, report) {
  if (!pipelines.has(backend)) {
    const t0 = performance.now();
    const entry = pipeline('background-removal', MODEL.id, {
      device: backend,
      dtype: MODEL.dtype,
      progress_callback: (d) => {
        if (d?.status !== 'progress') return;
        report({ stage: 'model-download', loaded: d.loaded, total: d.total });
      },
    }).then((seg) => ({
      seg,
      loadMs: performance.now() - t0,
      cold: true, // the first run on a backend absorbs shader/JIT warm-up
    }));
    pipelines.set(backend, entry);
    entry.catch(() => pipelines.delete(backend));
  }
  return pipelines.get(backend);
}

async function gpuAdapter() {
  if (!('gpu' in navigator)) return null;
  try {
    return (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) || null;
  } catch {
    return null;
  }
}

async function run({ file, backend, runtime = 'auto' }, report) {
  if (!(file instanceof Blob)) throw new Error('No image reached the worker.');
  if (runtime !== 'auto' && runtime !== 'cpu' && runtime !== 'webgpu') {
    throw new Error(`Unknown runtime "${runtime}".`);
  }
  if (typeof OffscreenCanvas === 'undefined') {
    // Surfaced as a plain message: a bare "OffscreenCanvas is not defined"
    // from deep inside the worker tells the visitor nothing.
    throw new Error('This browser cannot decode the photo inside a worker (no OffscreenCanvas there), so it cannot run this experiment.');
  }

  const adapter = await gpuAdapter();
  let effective = backend === 'auto' ? (adapter ? 'webgpu' : 'wasm') : backend;
  let fallbackReason = null;
  if (effective === 'webgpu' && !adapter) {
    throw new Error('WebGPU is not available in this browser (no adapter). Pick WASM instead.');
  }

  // The runtime build follows the backend. WASM gets the CPU-only build: half
  // the download, and on the CPU provider measurably faster than the
  // WebGPU-capable one. `runtime` overrides this for tests and experiments.
  const flavor = runtime === 'auto' ? effective : runtime;
  const runtimeInfo = await ensureRuntime(flavor, report);

  report({ stage: 'session', backend: effective });
  let entry;
  try {
    entry = await ensurePipeline(effective, report);
  } catch (err) {
    // Only "auto" may fall back; an explicit choice reports as is.
    if (backend !== 'auto') throw err;
    fallbackReason = err?.message || String(err);
    effective = 'wasm';
    report({ stage: 'session', backend: effective, fallbackReason });
    entry = await ensurePipeline(effective, report);
  }

  report({ stage: 'decode' });
  const td = performance.now();
  const bitmap = await createImageBitmap(file);
  let image;
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error(
        `Image is ${bitmap.width}×${bitmap.height} — above this experiment's limit of ${MAX_PIXELS / 1e6} MP.`,
      );
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    image = new RawImage(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height, 4);
  } finally {
    bitmap.close();
  }
  const decodeMs = performance.now() - td;

  report({ stage: 'inference', backend: effective });
  const t0 = performance.now();
  const out = await entry.seg(image);
  const runMs = performance.now() - t0;

  // Classify the alpha outcome while the pixels are still here. The matte
  // inside the person lands just under 1.0 (≈254 after scaling), so "kept" is
  // alpha ≥ 128, not alpha == 255.
  let removed = 0;
  let soft = 0;
  for (let i = 3; i < out.data.length; i += 4) {
    const a = out.data[i];
    if (a < 128) removed++;
    if (a >= 16 && a <= 239) soft++;
  }
  const pixels = image.width * image.height;

  const info = effective === 'webgpu' && adapter?.info ? adapter.info : null;
  const stats = {
    requested: backend,
    backend: effective,
    fallbackReason,
    firstRun: entry.cold,
    runtime: runtimeInfo,
    model: {
      id: MODEL.id,
      dtype: MODEL.dtype,
      file: MODEL.file,
      bytes: MODEL.bytes,
      loadMs: entry.loadMs,
    },
    input: { width: image.width, height: image.height },
    decodeMs,
    runMs,
    removedPct: (100 * removed) / pixels,
    keptPct: (100 * (pixels - removed)) / pixels,
    softPct: (100 * soft) / pixels,
    gpu: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device } : null,
  };
  entry.cold = false;

  // A fresh, exactly sized buffer: the only transferable thing back to the page.
  const rgba = new Uint8ClampedArray(out.data);
  return { width: image.width, height: image.height, rgba: rgba.buffer, stats };
}

self.onmessage = async (e) => {
  const { id, op } = e.data || {};
  const report = (p) => self.postMessage({ type: 'progress', id, ...p });
  try {
    if (op !== 'run') throw new Error(`Unknown worker op "${op}".`);
    const result = await run(e.data, report);
    self.postMessage({ id, result }, [result.rgba]);
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
