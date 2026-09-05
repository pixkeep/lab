# PixKeep Lab

Public, reproducible in-browser image-codec experiments — live at **https://lab.pixkeep.app**.

Browsers all claim to support the same image APIs. Lab measures what they **actually do**, on your device, with your photos. Everything runs client-side; nothing is uploaded.

## Experiments

| Route | What it measures |
|---|---|
| [`/encode-matrix/`](https://lab.pixkeep.app/encode-matrix/) | `canvas.toBlob` JPEG/WebP/AVIF across 6 quality levels — native vs WASM reference encoders (MozJPEG / libwebp / @jsquash-avif): bytes, latency, DSSIM |

## Run it yourself

Open https://lab.pixkeep.app/encode-matrix/ — use your own photos or the reference images
(served from `cdn.pixkeep.app`, the same four images our published numbers use).
Results stay on your device; sharing is opt-in via the Download/Copy/Email buttons.

## Develop

```bash
npm install
npm run dev        # http://localhost:4322 (4322, not the Astro default — stays
                   # clear of the main pixkeep.app dev server and is in the CDN's
                   # CORS allowlist, so reference-set fetches work locally)
```

> **Dev-mode caveat:** `npm run dev` (Vite dev) is for UI work only — the
> @jsquash WASM codecs (libwebp / AVIF) fail to instantiate their .wasm there,
> so the WASM reference encoders render empty. MozJPEG works. For real benchmark
> runs use the production build (`npm run build && npm run preview`) or the
> live site. This mirrors the main pixkeep.app repo's dev-mode limitations.

## Reproduce our numbers (Playwright)

The bench drives itself in the browser; the spec opens the page with
`?samples=all&autorun=1` and collects `window.__benchEncodeResult`:

```bash
npx playwright install
BENCH_SAMPLES=graphic-text npx playwright test --project=chromium   # smoke
npx playwright test --project=chromium                              # full reference images
BENCH_LIVE=1 npx playwright test --project=webkit                   # against the live site
BENCH_BASE=http://localhost:4333 npx playwright test                # target a server you started yourself
```

The "partial format selection" test uses a local fixture (`tests/fixtures/tiny.png`) so
it stays hermetic; the data-collection test pulls the real reference images from the CDN.

JSON results land in `tmp/encode-bench-<project>-<timestamp>.json`.

## Methodology

- **Support detection** by the returned blob's `type` — browsers that can't encode a
  format silently return PNG instead of throwing.
- **Size & timing**: one measured full-resolution encode per (group × format × quality)
  cell — native and WASM treated identically. Single run; foreground tab, DevTools closed.
- **Quality**: DSSIM — the official [dssim-core](https://github.com/kornelski/dssim) v3.4.0
  kernel via [dssim-wasm](https://github.com/pixkeep/dssim-wasm) (lower = closer) — scored
  on a shared 1200px center-crop analysis frame so every encoder sees identical framing.
  dssim's numeric scale changes between versions; cite "dssim-core 3.4.0 via dssim-wasm"
  when reusing these numbers.
- **WASM reference encoders** run in dedicated Web Workers. The first encode per format
  (analysis frame, unmeasured) absorbs worker startup and `.wasm` compilation.
- Quality scales are **not** comparable across encoders — compare at matched DSSIM.

## Deploy

Production is a Cloudflare **Workers** project (static-assets upload, name
`red-meadow-d766`, custom domain `lab.pixkeep.app`). `public/_headers` carries the CSP
and is served on deploy — see its comment before touching `script-src`
(mozjpeg's emscripten glue needs `'unsafe-eval'`).

```bash
npm run build && npx wrangler deploy   # needs `npx wrangler login` once
```

## License

MIT (c) PixKeep — for everything except the DSSIM kernel.

`public/dssim_wasm.wasm` is the official dssim-core v3.4.0 compiled via
[dssim-wasm](https://github.com/pixkeep/dssim-wasm), licensed **AGPL-3.0** —
see [third_party/dssim-wasm/](third_party/dssim-wasm/) (LICENSE + NOTICE).
It is used unmodified as a separate work; it does not relicense this repository.
