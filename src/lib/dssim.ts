// Shared DSSIM (structural similarity) computation used by the compressor's
// Compare feature and by benchmark harnesses. Block-grid SSIM at native
// resolution — 8×8 non-overlapping blocks, mean of block SSIMs, reported as
// dssim = 1/SSIM − 1 (kornelski/dssim convention).
//
// Extracted from image-compressor.astro (2026-08-08) so both the tool page
// and the benchmark harness use one implementation.
//
// computeDSSIMStretched added 2026-08-22 for the standalone compare tool:
// same block metric over the full frame after stretching the second image to
// the first one's dimensions — for pairs whose sizes differ (resize / crop
// comparisons). computeDSSIM itself is unchanged (benchmark parity).

const BLOCK = 8;

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
 * Mean block-grid SSIM over two equally sized RGBA buffers, reported as
 * dssim = 1/SSIM − 1. 8×8 non-overlapping blocks; partial edge blocks are
 * ignored (same as the original inline loop).
 */
function blockGridDSSIM(
  oData: Uint8ClampedArray,
  cData: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const C1 = (0.01 * 255) * (0.01 * 255);
  const C2 = (0.03 * 255) * (0.03 * 255);
  const n = BLOCK * BLOCK;
  const blocksX = Math.floor(width / BLOCK);
  const blocksY = Math.floor(height / BLOCK);
  let ssimSum = 0;
  let blockCount = 0;
  for (let by = 0; by < blocksY; by++) {
    const rowBase = by * BLOCK * width * 4;
    for (let bx = 0; bx < blocksX; bx++) {
      const colBase = bx * BLOCK * 4;
      let sumO = 0, sumC = 0, sumOO = 0, sumCC = 0, sumOC = 0;
      for (let py = 0; py < BLOCK; py++) {
        const pxBase = rowBase + py * width * 4 + colBase;
        for (let px = 0; px < BLOCK; px++) {
          const i = pxBase + px * 4;
          const yO = 0.299 * oData[i] + 0.587 * oData[i + 1] + 0.114 * oData[i + 2];
          const yC = 0.299 * cData[i] + 0.587 * cData[i + 1] + 0.114 * cData[i + 2];
          sumO += yO; sumC += yC; sumOO += yO * yO; sumCC += yC * yC; sumOC += yO * yC;
        }
      }
      const muO = sumO / n;
      const muC = sumC / n;
      const varO = Math.max(0, sumOO / n - muO * muO);
      const varC = Math.max(0, sumCC / n - muC * muC);
      const cov  = sumOC / n - muO * muC;
      const blockSSIM = ((2 * muO * muC + C1) * (2 * cov + C2)) /
                       ((muO * muO + muC * muC + C1) * (varO + varC + C2));
      ssimSum += blockSSIM;
      blockCount++;
    }
  }
  if (blockCount === 0) return 0;
  const meanSSIM = ssimSum / blockCount;
  return Math.max(0, (1 / meanSSIM) - 1);
}

/**
 * Compute dssim between two image blobs (1/SSIM − 1, lower = closer).
 * Same-size pairs only — both images are center-square-cropped to the shared
 * side before comparing. Throws when that square is too small for block-grid
 * SSIM.
 */
export async function computeDSSIM(originalBlob: Blob, compressedBlob: Blob): Promise<number> {
  // Block-grid SSIM, native resolution, no downsample.
  // The earlier implementation used global (single-window) SSIM over a
  // 512×512 downsample — that produced misleadingly low scores on heavily
  // compressed images (sky banding at q=11% still read as 0.0023 because
  // global means/variances are barely perturbed). 8×8 non-overlapping
  // blocks at native resolution gives block-level spatial sensitivity:
  // blocks in artifact-rich regions drag the mean down, matching what
  // users actually see. Approximates kornelski/dssim behavior at the
  // cost of stride=1 sliding-window accuracy (~10–30ms per compute on a
  // typical 600×800 photo).
  const [oImg, cImg] = await Promise.all([
    loadImageFromBlob(originalBlob),
    loadImageFromBlob(compressedBlob),
  ]);
  const side = Math.min(
    oImg.naturalWidth, oImg.naturalHeight,
    cImg.naturalWidth, cImg.naturalHeight,
  );
  if (side < BLOCK * 2) {
    // Too small for block-grid SSIM to be meaningful. Throw so the caller's
    // .catch handles it silently (no DSSIM badge shown) rather than
    // returning 0 — a "Lossless" badge on a 12×12 favicon would be a lie.
    throw new Error(`Image too small for DSSIM (${side}px < 16px)`);
  }
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
  return blockGridDSSIM(oData, cData, side, side);
}

/**
 * DSSIM for pairs with DIFFERENT dimensions: the modified image is stretched
 * to the original's full frame (no center-square crop), then the same
 * block-grid metric runs over the whole frame. This is what the standalone
 * compare tool shows when the user asks to compare e.g. an original against
 * a resized export — the score then describes exactly what the overlay /
 * diff view renders. Throws when the frame is too small for block-grid SSIM.
 */
export async function computeDSSIMStretched(originalBlob: Blob, modifiedBlob: Blob): Promise<number> {
  const [oImg, mImg] = await Promise.all([
    loadImageFromBlob(originalBlob),
    loadImageFromBlob(modifiedBlob),
  ]);
  const w = oImg.naturalWidth;
  const h = oImg.naturalHeight;
  if (Math.min(w, h) < BLOCK * 2) {
    throw new Error(`Image too small for DSSIM (${Math.min(w, h)}px < 16px)`);
  }
  const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  oc.getContext('2d')!.drawImage(oImg, 0, 0, w, h);
  mc.getContext('2d')!.drawImage(mImg, 0, 0, w, h);
  const oData = oc.getContext('2d')!.getImageData(0, 0, w, h).data;
  const mData = mc.getContext('2d')!.getImageData(0, 0, w, h).data;
  return blockGridDSSIM(oData, mData, w, h);
}
