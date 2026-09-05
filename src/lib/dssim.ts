// DSSIM quality metric for the lab benchmarks — official implementation:
// dssim-core v3.4.0 (kornelski/dssim) compiled to WebAssembly via
// pixkeep/dssim-wasm (see third_party/dssim-wasm/NOTICE for licensing and
// the version-pinning caveat). The artifact lives at /dssim_wasm.wasm and is
// fetched same-origin at first use; the lab CSP carries 'wasm-unsafe-eval'.
//
// Output scale: dssim = 1/SSIM − 1 (lower = closer), straight from
// dssim_compare — the same convention the block-grid approximation used, but
// the numbers are NOT comparable to it (full sliding-window SSIM with
// dssim's own luma/color pipeline vs 8×8 non-overlapping blocks). Cite
// "dssim-core 3.4.0 via dssim-wasm" when publishing numbers.
//
// Framing decisions are inherited from the previous implementation unchanged:
// computeDSSIM center-square-crops both images to the shared side (benchmark
// parity with the numbers published before 2026-09); computeDSSIMStretched
// stretches the modified image to the original's full frame. Only the metric
// kernel was swapped.

const WASM_URL = '/dssim_wasm.wasm';

type DssimExports = {
  dssim_new(): number;
  dssim_alloc(len: number): number;
  dssim_create_image_rgba(ctx: number, ptr: number, w: number, h: number): number;
  dssim_compare(ctx: number, a: number, b: number): number;
  dssim_free_image(img: number): void;
  dssim_free(ctx: number): void;
  dssim_last_error_ptr(): number;
  dssim_last_error_len(): number;
  memory: WebAssembly.Memory;
};

let exportsPromise: Promise<DssimExports> | null = null;

function loadExports(): Promise<DssimExports> {
  if (!exportsPromise) {
    exportsPromise = (async () => {
      try {
        const { instance } = await WebAssembly.instantiateStreaming(fetch(WASM_URL), {});
        return instance.exports as unknown as DssimExports;
      } catch {
        // instantiateStreaming fails on a missing/incorrect MIME type —
        // fall back to a full-buffer instantiate.
        const { instance } = await WebAssembly.instantiate(await (await fetch(WASM_URL)).arrayBuffer(), {});
        return instance.exports as unknown as DssimExports;
      }
    })();
  }
  return exportsPromise;
}

let ctx: number | null = null;

function lastError(ex: DssimExports): string {
  const len = ex.dssim_last_error_len();
  if (!len) return 'dssim failure (no panic message)';
  // fresh view: memory may have grown since the pointer was recorded
  const bytes = new Uint8Array(ex.memory.buffer, ex.dssim_last_error_ptr(), len);
  return new TextDecoder().decode(bytes);
}

function toImg(ex: DssimExports, rgba: Uint8ClampedArray, w: number, h: number): number {
  const ptr = ex.dssim_alloc(rgba.length);
  // fresh view: memory may have grown in dssim_alloc
  new Uint8Array(ex.memory.buffer).set(rgba, ptr);
  const img = ex.dssim_create_image_rgba(ctx!, ptr, w, h);
  if (img === 0) throw new Error(lastError(ex));
  return img;
}

/** Official dssim over two equally sized RGBA buffers (lower = closer). */
async function dssimRGBA(
  oData: Uint8ClampedArray,
  cData: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<number> {
  const ex = await loadExports();
  if (ctx === null) ctx = ex.dssim_new();
  const a = toImg(ex, oData, width, height);
  const b = toImg(ex, cData, width, height);
  try {
    return ex.dssim_compare(ctx, a, b);
  } finally {
    ex.dssim_free_image(a);
    ex.dssim_free_image(b);
  }
}

export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/**
 * Compute dssim between two image blobs (1/SSIM − 1, lower = closer),
 * official dssim-core 3.4.0 kernel. Same-size pairs only — both images are
 * center-square-cropped to the shared side before comparing.
 */
export async function computeDSSIM(originalBlob: Blob, compressedBlob: Blob): Promise<number> {
  const [oImg, cImg] = await Promise.all([
    loadImageFromBlob(originalBlob),
    loadImageFromBlob(compressedBlob),
  ]);
  const side = Math.min(
    oImg.naturalWidth, oImg.naturalHeight,
    cImg.naturalWidth, cImg.naturalHeight,
  );
  const oc = document.createElement('canvas'); oc.width = side; oc.height = side;
  const cc = document.createElement('canvas'); cc.width = side; cc.height = side;
  function coverDraw(srcImg: HTMLImageElement, dst: HTMLCanvasElement) {
    const ctx = dst.getContext('2d')!;
    const w = srcImg.naturalWidth, h = srcImg.naturalHeight;
    const cropSide = Math.min(w, h);
    const sx = Math.floor((w - cropSide) / 2);
    const sy = Math.floor((h - cropSide) / 2);
    ctx.drawImage(srcImg, sx, sy, cropSide, cropSide, 0, 0, side, side);
  }
  coverDraw(oImg, oc);
  coverDraw(cImg, cc);
  const oData = oc.getContext('2d')!.getImageData(0, 0, side, side).data;
  const cData = cc.getContext('2d')!.getImageData(0, 0, side, side).data;
  return dssimRGBA(oData, cData, side, side);
}

/**
 * DSSIM for pairs with DIFFERENT dimensions: the modified image is stretched
 * to the original's full frame (no center-square crop), then the official
 * kernel runs over the whole frame. The score describes exactly what the
 * overlay / diff view renders.
 */
export async function computeDSSIMStretched(originalBlob: Blob, modifiedBlob: Blob): Promise<number> {
  const [oImg, mImg] = await Promise.all([
    loadImageFromBlob(originalBlob),
    loadImageFromBlob(modifiedBlob),
  ]);
  const w = oImg.naturalWidth;
  const h = oImg.naturalHeight;
  const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  oc.getContext('2d')!.drawImage(oImg, 0, 0, w, h);
  mc.getContext('2d')!.drawImage(mImg, 0, 0, w, h);
  const oData = oc.getContext('2d')!.getImageData(0, 0, w, h).data;
  const mData = mc.getContext('2d')!.getImageData(0, 0, w, h).data;
  return dssimRGBA(oData, mData, w, h);
}
