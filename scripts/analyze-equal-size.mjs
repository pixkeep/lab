/**
 * Equal-size / equal-DSSIM analysis over encode-matrix run JSONs.
 *
 * The encode-matrix report (aggregate-encode-bench.mjs) shows each encoder's
 * own quality ladder — but quality scales are not portable: "q80" means
 * different things in every encoder, so the ladders cannot be compared
 * directly. This script answers the comparable questions instead:
 *
 *   - at equal FILE SIZE, which encoder is closer to the original (lower DSSIM)?
 *   - at equal DSSIM, which encoder needs fewer bytes?
 *
 * It uses the ladder points (one per quality level) and interpolates between
 * adjacent levels in log(size) ↔ log(dssim) space, exiting the range as
 * "out of range" rather than extrapolating. The anchor for every comparison is
 * the first run's native encoder at q80 (by default: Chrome on Windows).
 *
 * The floating-point source image (alpha-transparent.png) is skipped: JPEG
 * flattens alpha, so its DSSIM there is a pathological number, not a quality
 * signal.
 *
 * Usage (from the repo root):
 *   node scripts/analyze-equal-size.mjs [--dir <path>] [--images a.png,b.png]
 *     default dir:    public/bench-data
 *     default images: flower1.png, grass1.png, graphic-text.png
 *
 * Markdown tables are printed to stdout.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dir = argValue('--dir', fileURLToPath(new URL('../public/bench-data/', import.meta.url)));
const images = argValue('--images', 'flower1.png,grass1.png,graphic-text.png').split(',').map((s) => s.trim());
const QS = [10, 40, 60, 80, 92, 100];
const MB = (n) => (n == null ? '—' : (n / 1048576).toFixed(2));

const runs = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!raw.device) throw new Error(`${f}: legacy schema — this analysis needs lab-schema runs`);
    return { file: f, ...raw };
  })
  .filter((r) => r.results.length >= 3);
if (runs.length === 0) {
  console.error(`no usable run JSONs in ${dir}`);
  process.exit(1);
}

const label = (r) => `${r.device.browser} ${String(r.device.browserVersion).split('.')[0]}`;
const entry = (run, img, group, format, q) =>
  run.results.find((r) => r.file === img)?.entries.find((e) => e.group === group && e.format === format && e.q === q);

/** Ladder points for one encoder on one image, sorted by size. */
function ladder(run, img, group, format) {
  return QS
    .map((q) => {
      const e = entry(run, img, group, format, q);
      return e && e.support === 'ok' && e.dssim > 0 ? { q, size: e.sizeFull, dssim: e.dssim } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.size - b.size);
}

/** Interpolate between adjacent ladder points; null when the target is out of range. */
function sizeAtDssim(pts, target) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.dssim - target) * (b.dssim - target) <= 0 && a.dssim !== b.dssim) {
      const t = (Math.log(target) - Math.log(a.dssim)) / (Math.log(b.dssim) - Math.log(a.dssim));
      return Math.exp(Math.log(a.size) + t * (Math.log(b.size) - Math.log(a.size)));
    }
  }
  return null;
}
function dssimAtSize(pts, target) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.size - target) * (b.size - target) <= 0 && a.size !== b.size) {
      const t = (Math.log(target) - Math.log(a.size)) / (Math.log(b.size) - Math.log(a.size));
      return Math.exp(Math.log(a.dssim) + t * (Math.log(b.dssim) - Math.log(a.dssim)));
    }
  }
  return null;
}

/** Who the reference is: first run (alphabetically → Chrome on Windows). */
const anchorRun = runs.find((r) => /chrome/i.test(r.device.browser)) || runs[0];
console.log(`# Equal-size / equal-DSSIM analysis\n`);
console.log(`Source: \`${dir}\` — ${runs.length} environments: ${runs.map(label).join(', ')}`);
console.log(`Anchor: **${label(anchorRun)} native @ q80** per image/format.\n`);

for (const img of images) {
  const available = runs.filter((r) => ladder(r, img, 'native', 'jpeg').length >= 3);
  if (available.length === 0) continue;
  console.log(`\n## ${img}\n`);

  for (const format of ['jpeg', 'webp']) {
    // Encoders in this format family: every run's native + the WASM reference
    // (taken from the anchor run — the WASM group is identical across runs).
    const encoders = [];
    for (const r of runs) {
      const pts = ladder(r, img, 'native', format);
      if (pts.length >= 3) encoders.push({ name: `${label(r)} native`, pts });
    }
    const wasmPts = ladder(anchorRun, img, 'wasm', format);
    if (wasmPts.length >= 3) encoders.push({ name: `WASM ${format === 'jpeg' ? 'MozJPEG' : 'libwebp'}`, pts: wasmPts });

    // Deduplicate identical ladders (e.g. Edge == Chrome on Windows).
    const seen = new Set();
    const unique = encoders.filter((e) => {
      const key = e.pts.map((p) => p.size).join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const anchor = entry(anchorRun, img, 'native', format, 80);
    if (!anchor || anchor.support !== 'ok') {
      console.log(`**${format.toUpperCase()}**: anchor unavailable (${anchor?.support ?? 'not measured'}) on this image.\n`);
      continue;
    }

    console.log(`### ${format.toUpperCase()} — anchor size ${MB(anchor.sizeFull)} MB @ DSSIM ${anchor.dssim.toFixed(5)}\n`);
    console.log(`| encoder | @ equal size: DSSIM (vs anchor) | @ equal DSSIM: size (vs anchor) |`);
    console.log(`|---|---|---|`);
    for (const e of unique) {
      const d = dssimAtSize(e.pts, anchor.sizeFull);
      const s = sizeAtDssim(e.pts, anchor.dssim);
      // Lower is better for both metrics (smaller DSSIM / fewer bytes).
      const fmtPct = (v, ref) => {
        if (v == null) return 'out of range';
        const pct = (1 - v / ref) * 100;
        if (Math.abs(pct) < 0.05) return '—';
        return `${Math.abs(pct).toFixed(1)}% ${pct > 0 ? 'better' : 'worse'}`;
      };
      const sizeCell = d == null ? 'out of range' : `${d.toFixed(5)} (${fmtPct(d, anchor.dssim)})`;
      const dssimCell = s == null ? 'out of range' : `${MB(s)} MB (${fmtPct(s, anchor.sizeFull)})`;
      console.log(`| ${e.name} | ${sizeCell} | ${dssimCell} |`);
    }
    console.log('');
  }

  // Raw ladders, so the interpolation is auditable.
  console.log(`<details><summary>ladder points (${img})</summary>\n`);
  for (const img2 of [img]) {
    for (const format of ['jpeg', 'webp']) {
      for (const r of runs) {
        const pts = ladder(r, img2, 'native', format);
        if (pts.length) console.log(`- ${label(r)} native ${format}: ${pts.map((p) => `q${p.q} ${MB(p.size)}MB@${p.dssim.toFixed(5)}`).join(' · ')}`);
      }
      const wasm = ladder(anchorRun, img2, 'wasm', format);
      if (wasm.length) console.log(`- WASM ${format === 'jpeg' ? 'MozJPEG' : 'libwebp'}: ${wasm.map((p) => `q${p.q} ${MB(p.size)}MB@${p.dssim.toFixed(5)}`).join(' · ')}`);
    }
  }
  console.log(`\n</details>\n`);
}
