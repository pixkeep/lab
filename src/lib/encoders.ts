// WASM image encoders (MozJPEG / libwebp / @jsquash-avif), each running in a
// dedicated Web Worker off the main thread.
//
// Extracted from PixKeep's src/utils/conversion-edges.ts (the private product
// repo) as a standalone module — the pipeline registry and unrelated edges
// were dropped; the encoder implementations are byte-equivalent.
//
// Why WASM control groups exist next to native canvas.toBlob:
// - WebKit's canvas.toBlob('image/webp') IGNORES the quality parameter and
//   encodes (near-)losslessly — a 12MP photo at slider "80%" came out at
//   20.55 MB vs 3.97 MB source (measured 2026-08-15).
// - WebKit's canvas.toBlob('image/jpeg') is measurably less efficient than
//   Chromium/Firefox encoders.
// - No browser currently honours canvas.toBlob('image/avif') on the main
//   thread (2026-08: Chrome/Firefox/Edge silently return PNG).
//
// Worker shape: classic workers with static imports only — Vite bundles each
// worker graph into one IIFE file at build time, so the wasm asset URL is
// baked in and no import.meta.url resolution happens at runtime.

const DEFAULT_QUALITY = 0.92;

/** WebKit-family detection (UA-based: the behavior is engine-specific). */
export function isWebKit(): boolean {
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|crios|edg|firefox|fxios/i.test(ua);
}

// NOTE: each driver below keeps the LITERAL `new Worker(new URL('./x.js',
// import.meta.url))` pattern inline. Vite detects workers by static analysis
// of exactly that pattern — routing it through a helper (a `workerUrl`
// parameter) builds fine but emits an unbundled ESM worker that then dies at
// runtime with "Cannot use import statement outside a module". Do not DRY.
interface Driver {
  getWorker(): Worker;
  pending: Map<number, { resolve: (blob: Blob) => void; reject: (err: Error) => void }>;
  nextId(): number;
}

function wireDriver(w: Worker, mime: string, pending: Driver['pending'], reset: () => void): void {
  w.onmessage = (e) => {
    const { id, result, error } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(new Blob([result], { type: mime }));
  };
  w.onerror = (e) => {
    const err = new Error(e.message || 'encoder worker failed');
    pending.forEach((p) => p.reject(err));
    pending.clear();
    reset();
  };
}

function makeDriver(create: () => Worker, mime: string): Driver {
  let worker: Worker | null = null;
  let seq = 0;
  const pending: Driver['pending'] = new Map();
  return {
    pending,
    nextId: () => ++seq,
    getWorker: () => {
      if (!worker) {
        worker = create();
        wireDriver(worker, mime, pending, () => { worker = null; });
      }
      return worker;
    },
  };
}

function canvasToRgbaBuffer(canvas: HTMLCanvasElement, flattenWhite: boolean): { buf: ArrayBuffer; width: number; height: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for encode.');
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  if (flattenWhite) {
    // MozJPEG has no alpha channel — composite transparency onto white
    // (canvas.toBlob would produce black there).
    let hasAlpha = false;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] !== 255) { hasAlpha = true; break; }
    }
    if (hasAlpha) {
      for (let i = 0; i < rgba.length; i += 4) {
        const a = rgba[i + 3];
        if (a === 255) continue;
        const k = a / 255;
        rgba[i] = Math.round(rgba[i] * k + 255 * (1 - k));
        rgba[i + 1] = Math.round(rgba[i + 1] * k + 255 * (1 - k));
        rgba[i + 2] = Math.round(rgba[i + 2] * k + 255 * (1 - k));
        rgba[i + 3] = 255;
      }
    }
  }
  // Copy into a strictly ArrayBuffer-backed typed array so the buffer can be
  // transferred to the worker (RGBA8, same bytes the WASM encoder expects).
  const buf = new ArrayBuffer(rgba.byteLength);
  new Uint8ClampedArray(buf).set(rgba);
  return { buf, width, height };
}

// ─── AVIF (@jsquash/avif) ───────────────────────────────────────────────────

const avifDriver = makeDriver(() => {
  // Dev: Vite serves the worker source with ESM imports intact → module
  // worker. Build: single IIFE file → classic worker.
  return import.meta.env.DEV
    ? new Worker(new URL('../workers/avif-encoder-worker.js', import.meta.url), { type: 'module' })
    : new Worker(new URL('../workers/avif-encoder-worker.js', import.meta.url));
}, 'image/avif');

/** Encode a canvas to AVIF via the @jsquash/avif WASM encoder (quality 0..1). */
export async function encodeCanvasAsAvif(canvas: HTMLCanvasElement, quality = DEFAULT_QUALITY): Promise<Blob> {
  const { buf, width, height } = canvasToRgbaBuffer(canvas, false);
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = avifDriver.getWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const id = avifDriver.nextId();
    avifDriver.pending.set(id, { resolve, reject });
    w.postMessage({ id, data: buf, width, height, quality }, [buf]);
  });
}

// ─── WebP (libwebp via @jsquash/webp) ───────────────────────────────────────

const webpDriver = makeDriver(() => {
  return import.meta.env.DEV
    ? new Worker(new URL('../workers/webp-encoder-worker.js', import.meta.url), { type: 'module' })
    : new Worker(new URL('../workers/webp-encoder-worker.js', import.meta.url));
}, 'image/webp');

/**
 * Encode a canvas to WebP. On WebKit-family browsers (or with forceWasm)
 * this goes through the libwebp WASM encoder in a worker; elsewhere it uses
 * native canvas.toBlob.
 * @param forceWasm benchmark/testing: route through the WASM encoder on any
 * browser (the encode-matrix bench uses this for the WASM control group).
 */
export async function encodeCanvasAsWebp(canvas: HTMLCanvasElement, quality = DEFAULT_QUALITY, forceWasm = false): Promise<Blob> {
  if (!isWebKit() && !forceWasm) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('canvas.toBlob(image/webp) failed'))),
        'image/webp',
        quality,
      );
    });
  }
  const { buf, width, height } = canvasToRgbaBuffer(canvas, false);
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = webpDriver.getWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const id = webpDriver.nextId();
    webpDriver.pending.set(id, { resolve, reject });
    w.postMessage({ id, data: buf, width, height, quality }, [buf]);
  });
}

// ─── JPEG (MozJPEG via @wasm-codecs/mozjpeg) ────────────────────────────────

const jpegDriver = makeDriver(() => {
  return import.meta.env.DEV
    ? new Worker(new URL('../workers/jpeg-encoder-worker.js', import.meta.url), { type: 'module' })
    : new Worker(new URL('../workers/jpeg-encoder-worker.js', import.meta.url));
}, 'image/jpeg');

/**
 * Encode a canvas to JPEG. On WebKit-family browsers (or with forceWasm)
 * this goes through the MozJPEG WASM encoder in a worker; elsewhere it uses
 * native canvas.toBlob. Transparent pixels are composited onto white in the
 * WASM path (mozjpeg drops alpha).
 * @param forceWasm benchmark/testing: WASM control group.
 */
export async function encodeCanvasAsJpeg(canvas: HTMLCanvasElement, quality = DEFAULT_QUALITY, forceWasm = false): Promise<Blob> {
  if (!isWebKit() && !forceWasm) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('canvas.toBlob(image/jpeg) failed'))),
        'image/jpeg',
        quality,
      );
    });
  }
  const { buf, width, height } = canvasToRgbaBuffer(canvas, true);
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = jpegDriver.getWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const id = jpegDriver.nextId();
    jpegDriver.pending.set(id, { resolve, reject });
    w.postMessage({ id, data: buf, width, height, quality }, [buf]);
  });
}
