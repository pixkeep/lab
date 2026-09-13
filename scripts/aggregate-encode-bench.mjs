/**
 * Aggregates encode-matrix run JSONs (the /encode-matrix/ page's "Download JSON"
 * output, or the Playwright driver in tests/e2e) into markdown tables.
 *
 * Usage (from the repo root):
 *   node scripts/aggregate-encode-bench.mjs [focusImage] [--dir <path>]
 *     default focus: flower1
 *     default dir:   public/bench-data  (the published run set)
 * Writes <dir>/report.md and prints the same to stdout.
 *
 * Handles both JSON schemas:
 *   - lab (2026-09-05+): { benchVersion, generatedAt, device{...}, results }
 *   - legacy (2026-08-29, deleted private-repo harness): { meta{ua,cores}, results }
 * The legacy schema has no browser name (UA only), no per-quality silent rows
 * and measures WASM at the 1200px analysis size — not comparable with lab runs
 * (see the report footer); use it only to re-read historical files.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dirArgIdx = args.findIndex((a) => a === '--dir');
const dir = dirArgIdx >= 0
  ? args[dirArgIdx + 1]
  : fileURLToPath(new URL('../public/bench-data/', import.meta.url));
const focus = args.find((a, i) => !a.startsWith('--') && i !== dirArgIdx + 1) || 'flower1';

const MB = (n) => (n == null ? '—' : (n / 1024 / 1024).toFixed(2));
const KB = (n) => (n == null ? '—' : String(Math.round(n / 1024)));
const MS = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);
const DS = (n) => (n == null ? '—' : n.toFixed(5));

function parseUa(ua) {
  let browser = 'Unknown';
  let version = '';
  let m;
  if ((m = ua.match(/Edg(?:e|A)?\/([\d.]+)/))) [browser, version] = ['Edge', m[1]];
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) [browser, version] = ['Firefox', m[1]];
  else if ((m = ua.match(/Chrome\/([\d.]+)/))) [browser, version] = ['Chrome', m[1]];
  else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) [browser, version] = ['Safari', m[1]];
  const engine = /Gecko\/\d/.test(ua) && /Firefox/.test(ua) ? 'Gecko'
    : /Firefox/.test(ua) ? 'Gecko'
    : /AppleWebKit/.test(ua) && !/Chrome|Edg/.test(ua) ? 'WebKit'
    : /Chrome|Edg/.test(ua) ? 'Blink' : 'unknown';
  let os = 'Unknown';
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if ((m = ua.match(/Mac OS X ([\d_]+)/))) os = `macOS ${m[1].replace(/_/g, '.')}`;
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS/iPadOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return { browser, version, engine, os };
}

/** Normalize both schemas into one shape. */
function normalize(raw, file) {
  if (raw.device) {
    const d = raw.device;
    return {
      file, schema: 'lab', generatedAt: raw.generatedAt,
      browser: d.browser, version: d.browserVersion, engine: d.engine, os: d.os,
      cores: d.cores, gpu: d.gpu, screen: d.screen, memoryGB: d.memoryGB, ua: d.userAgent,
      results: raw.results,
    };
  }
  const ua = raw.meta?.ua || '';
  const parsed = parseUa(ua);
  return {
    file, schema: 'legacy', generatedAt: raw.meta?.ts, ...parsed,
    cores: raw.meta?.cores, gpu: null, screen: null, memoryGB: null, ua,
    results: raw.results,
  };
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error(`no JSON files in ${dir} — run the benchmark first`);
  process.exit(1);
}

const runs = files.map((f) => normalize(JSON.parse(readFileSync(join(dir, f), 'utf-8')), f));

// Drop partial runs (fewer images than the fullest run) and keep only the
// newest run per (browser, os) — older same-browser runs are superseded.
const maxImages = Math.max(...runs.map((r) => r.results.length));
const byKey = new Map();
for (const r of runs) {
  if (r.results.length !== maxImages) continue;
  const key = `${r.browser} ${r.os}`;
  const prev = byKey.get(key);
  if (!prev || (r.generatedAt || '') > (prev.generatedAt || '')) byKey.set(key, r);
}
const envs = [...byKey.values()].sort((a, b) => (a.browser + a.os).localeCompare(b.browser + b.os));
const dropped = runs.filter((r) => !envs.includes(r));

const entry = (env, file, group, format, q) =>
  env.results.find((r) => r.file === file)?.entries?.find((e) => e.group === group && e.format === format && e.q === q);

const out = [];
const p = (s = '') => out.push(s);

p('# Encode-matrix benchmark report');
p('');
p(`Generated: ${new Date().toISOString()}`);
p('');
p(`Sources (${envs.length} environments):`);
for (const e of envs) p(`- \`${e.file}\` — ${e.generatedAt || 'no timestamp'}`);
if (dropped.length) {
  p('');
  p('Dropped (partial or superseded):');
  for (const d of dropped) p(`- \`${d.file}\` — ${d.browser} ${d.version} ${d.os}, ${d.results.length} image(s), ${d.generatedAt || 'no timestamp'}`);
}
p('');

// ---- environments ----
p('## Environments');
p('');
p('| browser | engine | OS | cores | memory | GPU | screen | JSON schema |');
p('|---|---|---|---|---|---|---|---|');
for (const e of envs) {
  p(`| ${e.browser} ${e.version} | ${e.engine} | ${e.os} | ${e.cores ?? '—'} | ${e.memoryGB ? `≈${e.memoryGB} GB` : 'not exposed'} | ${e.gpu ?? '—'} | ${e.screen ?? '—'} | ${e.schema} |`);
}
p('');

// ---- support matrix ----
p('## Native toBlob support matrix (canvas.toBlob)');
p('');
p('| browser | JPEG | WebP | AVIF |');
p('|---|---|---|---|');
for (const e of envs) {
  const cells = ['jpeg', 'webp', 'avif'].map((fmt) => {
    const rows = e.results.flatMap((r) => r.entries.filter((en) => en.group === 'native' && en.format === fmt));
    if (rows.length === 0) return 'not tested';
    const oks = rows.filter((en) => en.support === 'ok');
    if (oks.length === rows.length) return 'ok';
    const probe = rows.find((en) => en.support !== 'ok');
    const actual = rows.map((en) => en.actualType).find(Boolean);
    return `${probe.support}→${actual || '?'} (${rows.length - oks.length}/${rows.length})`;
  });
  p(`| ${e.browser} ${e.version} | ${cells.join(' | ')} |`);
}
p('');
p('`ok` = returned blob type matches the requested type. `silent→…` = the browser silently returned a different type (PNG). Counts are cells across all images × quality levels.');
p('');

// ---- WASM control group status ----
p('## WASM reference encoders (same JSONs, control group)');
p('');
p('| browser | format | cells | ok | failed | first failure |');
p('|---|---|---|---|---|---|');
for (const e of envs) {
  for (const fmt of ['jpeg', 'webp', 'avif']) {
    const rows = e.results.flatMap((r) => r.entries.filter((en) => en.group === 'wasm' && en.format === fmt));
    if (rows.length === 0) { p(`| ${e.browser} | ${fmt} | 0 | 0 | 0 | — |`); continue; }
    const ok = rows.filter((r) => r.support === 'ok').length;
    const failed = rows.filter((r) => r.support !== 'ok');
    const first = failed[0]?.actualType ? String(failed[0].actualType).slice(0, 60) : '—';
    p(`| ${e.browser} | ${fmt} | ${rows.length} | ${ok} | ${failed.length} | ${first} |`);
  }
}
p('');

// ---- per-image q80 native vs wasm ----
const images = [...new Set(envs.flatMap((e) => e.results.map((r) => r.file)))].sort();
for (const img of images) {
  p(`## ${img} — @q80 full-res, native vs WASM`);
  p('');
  p('| browser | format | native size | native time | native dssim | wasm size | wasm time | wasm dssim |');
  p('|---|---|---|---|---|---|---|---|');
  for (const e of envs) {
    for (const fmt of ['jpeg', 'webp', 'avif']) {
      const n = entry(e, img, 'native', fmt, 80);
      const w = entry(e, img, 'wasm', fmt, 80);
      const nCell = !n ? '—' : n.support === 'ok' ? `${MB(n.sizeFull)} MB` : `${n.support}→${n.actualType || '?'}`;
      const wCell = !w ? '—' : w.support === 'ok' ? `${MB(w.sizeFull)} MB` : `${w.support}→${w.actualType || '?'}`;
      p(`| ${e.browser} ${e.version} | ${fmt} | ${nCell} | ${MS(n?.msFull)} | ${DS(n?.dssim)} | ${wCell} | ${MS(w?.msFull)} | ${DS(w?.dssim)} |`);
    }
  }
  p('');
}

// ---- quality response (native) ----
const QS = [10, 40, 60, 80, 92, 100];
const focusFile = images.find((i) => i.startsWith(focus)) || images[0];
for (const [metric, label] of [['sizeFull', 'full-res size'], ['dssim', 'DSSIM (official dssim-core 3.4.0)']]) {
  p(`## Quality response — native ${label}, ${focusFile}`);
  p('');
  p(`| browser | format | ${QS.map((q) => `q${q}`).join(' | ')} |`);
  p(`|---|${'---|'.repeat(QS.length + 1)}`);
  for (const e of envs) {
    for (const fmt of ['jpeg', 'webp', 'avif']) {
      const cells = QS.map((q) => {
        const en = entry(e, focusFile, 'native', fmt, q);
        if (!en) return '—';
        if (en.support !== 'ok') return `silent→${en.actualType ? en.actualType.replace('image/', '') : '?'}`;
        return metric === 'sizeFull' ? MB(en.sizeFull) : DS(en.dssim);
      });
      p(`| ${e.browser} ${e.version} | ${fmt} | ${cells.join(' | ')} |`);
    }
  }
  p('');
}

// ---- byte-equality: native webp vs libwebp wasm (Blink) ----
p('## Byte-equality check — native WebP vs libwebp (WASM)');
p('');
p('| browser | image | q | native bytes | libwebp bytes | identical |');
p('|---|---|---|---|---|---|');
for (const e of envs) {
  for (const img of images) {
    for (const q of QS) {
      const n = entry(e, img, 'native', 'webp', q);
      const w = entry(e, img, 'wasm', 'webp', q);
      if (!n || !w || n.support !== 'ok' || w.support !== 'ok') continue;
      p(`| ${e.browser} ${e.version} | ${img} | ${q} | ${n.sizeFull} | ${w.sizeFull} | ${n.sizeFull === w.sizeFull ? '✅' : '❌'} |`);
    }
  }
}
p('');

// ---- latency ----
p(`## Encode latency — native @q80, ${focusFile}`);
p('');
p('| browser | JPEG | WebP | WASM libwebp | WASM MozJPEG | WASM AVIF |');
p('|---|---|---|---|---|---|');
for (const e of envs) {
  const g = (grp, fmt) => MS(entry(e, focusFile, grp, fmt, 80)?.msFull);
  p(`| ${e.browser} ${e.version} | ${g('native', 'jpeg')} | ${g('native', 'webp')} | ${g('wasm', 'webp')} | ${g('wasm', 'jpeg')} | ${g('wasm', 'avif')} |`);
}
p('');

p('---');
p('');
p('Methodology notes:');
p('- One measured full-resolution encode per (image × format × quality × group) cell; foreground tab, single run.');
p('- DSSIM = official dssim-core v3.4.0 via dssim-wasm, scored on a shared 1200px center-crop analysis frame.');
p('- Quality scales are NOT comparable across encoders — compare at matched DSSIM or matched size.');
p('- Latency is single-run and machine/thermal dependent: comparable within one machine, not across machines.');
p('- Native AVIF: no browser tested can encode it (all silently return PNG) — the WASM column is the only AVIF datapoint.');
if (envs.some((e) => e.schema === 'legacy')) {
  p('- ⚠️ Legacy-schema runs in this report measured WASM at the 1200px analysis size and used the block-grid DSSIM approximation — not comparable with lab-schema runs.');
}

const report = out.join('\n');
writeFileSync(join(dir, 'report.md'), report + '\n');
console.log(report);
console.log(`\n→ ${join(dir, 'report.md')}`);
