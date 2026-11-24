// Background removal (MODNet via ONNX Runtime Web) — main-thread driver.
//
// All decoding, inference and compositing happen in a dedicated Web Worker
// (src/workers/background-removal-worker.js); this file only owns the worker
// lifecycle and the message protocol.

export type BackendChoice = 'auto' | 'webgpu' | 'wasm';
/** Which runtime build the worker loads; see src/lib/ort-manifest.json. */
export type RuntimeChoice = 'auto' | 'cpu' | 'webgpu';

export interface RunOptions {
  /**
   * Force a runtime build for tests and experiments. By default the build
   * follows the backend: WASM loads the CPU-only build, WebGPU the
   * WebGPU-capable one.
   */
  runtime?: RuntimeChoice;
}

export interface RunProgress {
  /** The previous worker ran another runtime build and had to be replaced. */
  stage: 'worker-restart' | 'runtime-download' | 'model-download' | 'session' | 'decode' | 'inference';
  /** Downloaded bytes so far and total (0 = not reported by the server). */
  loaded?: number;
  total?: number;
  label?: string;
  backend?: string;
  /** Set when "auto" had to leave WebGPU for WASM. */
  fallbackReason?: string;
}

export interface RunStats {
  requested: BackendChoice;
  backend: 'webgpu' | 'wasm';
  fallbackReason: string | null;
  firstRun: boolean;
  runtime: {
    flavor: 'cpu' | 'webgpu';
    file: string;
    rawBytes: number;
    shippedBytes: number;
    fetchMs: number;
    gunzipMs: number;
    version: string;
  };
  model: { id: string; dtype: string; file: string; bytes: number; loadMs: number };
  input: { width: number; height: number };
  decodeMs: number;
  runMs: number;
  /** Share of pixels with alpha < 128 / ≥ 128 / between 16 and 239 (soft edge). */
  removedPct: number;
  keptPct: number;
  softPct: number;
  gpu: { vendor: string; architecture: string; device: string } | null;
}

export interface RunResult {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  rgba: ArrayBuffer;
  stats: RunStats;
}

interface Pending {
  resolve: (r: RunResult) => void;
  reject: (err: Error) => void;
  onProgress: (p: RunProgress) => void;
}

let worker: Worker | null = null;
/** The runtime build `worker` was asked to load. */
let workerRuntime: RuntimeChoice | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

// NOTE: the LITERAL `new Worker(new URL('./x.js', import.meta.url))` pattern
// stays inline for the same reason as in src/lib/encoders.ts — Vite detects
// workers by static analysis of exactly that pattern. Dev serves the source
// with ESM imports intact (module worker); the build emits one IIFE file
// (classic worker).
function createWorker(): Worker {
  return import.meta.env.DEV
    ? new Worker(new URL('../workers/background-removal-worker.js', import.meta.url), { type: 'module' })
    : new Worker(new URL('../workers/background-removal-worker.js', import.meta.url));
}

function wire(w: Worker): void {
  w.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'progress') {
      pending.get(msg.id)?.onProgress(msg as RunProgress);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result as RunResult);
  };
  w.onerror = (e) => {
    dropWorker(new Error(e.message || 'background-removal worker failed'));
  };
}

function dropWorker(err: Error): void {
  worker?.terminate();
  worker = null;
  workerRuntime = null;
  pending.forEach((p) => p.reject(err));
  pending.clear();
}

/**
 * The worker for a run. The runtime is initialized once per worker, so a run
 * that needs the other runtime build gets a fresh worker (the model comes from
 * the browser cache; only the runtime is fetched again).
 * @returns the worker and whether it had to be replaced
 */
function getWorker(runtime: RuntimeChoice): { w: Worker; restarted: boolean } {
  const restarted = worker !== null && workerRuntime !== runtime;
  if (restarted) {
    worker?.terminate();
    worker = null;
  }
  if (!worker) {
    worker = createWorker();
    workerRuntime = runtime;
    wire(worker);
  }
  return { w: worker, restarted };
}

/**
 * Remove the background of an image on a worker thread.
 * @param file the image to cut out
 * @param backend "auto" picks WebGPU when the device has it and falls back to
 * WASM if the WebGPU session cannot be created; an explicit choice never falls
 * back, so a failure is reported as what it is.
 * @param options see RunOptions
 */
export function removeBackground(
  file: Blob,
  backend: BackendChoice,
  onProgress: (p: RunProgress) => void,
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const runtime: RuntimeChoice = options.runtime ?? (backend === 'auto' ? 'auto' : backend === 'wasm' ? 'cpu' : 'webgpu');
    const { w, restarted } = getWorker(runtime);
    if (restarted) onProgress({ stage: 'worker-restart' });
    const id = ++seq;
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, op: 'run', file, backend, runtime });
  });
}
