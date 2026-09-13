# Encode-matrix benchmark data

Raw JSON dumps from the [`/encode-matrix/`](https://lab.pixkeep.app/encode-matrix/) experiment —
**native `canvas.toBlob` encoding (JPEG / WebP / AVIF) versus WASM reference encoders**
(MozJPEG, libwebp, `@jsquash/avif`) across browsers and quality levels.

Every file here is an **unmodified export** of the page's "Download JSON" button (hash-identical
to what the browser produced). Nothing in this directory is hand-edited — corrections and
derived numbers live in generated files (`report.md`) or in the article that cites them.

## Files

Naming: `YYYY-MM-DD-<platform>-<browser>-<version>.json`

| File | Browser | Platform | Cores | Memory | GPU (as reported) | Screen |
|---|---|---|---|---|---|---|
| `2026-09-13-windows-chrome-153.json` | Chrome 153 (Blink) | Windows | 8 | ≈16 GB | Intel UHD Graphics 620 (ANGLE/D3D11) | 1536×864 @1.25x |
| `2026-09-13-windows-edge-153.json` | Edge 153 (Blink) | Windows | 8 | ≈16 GB | Intel UHD Graphics 620 (ANGLE/D3D11) | 1536×864 @1.25x |
| `2026-09-13-windows-firefox-155.json` | Firefox 155 (Gecko) | Windows | 8 | not exposed | Intel HD Graphics 400, or similar (masked) | 1536×864 @1.25x |
| `2026-09-13-macos-safari-18.6.json` | Safari 18.6 (WebKit) | macOS | 8 | not exposed | Apple GPU | 1440×900 @2x |

The four Windows runs came from one machine, back to back; the Safari run is a second machine.
All are **single runs** — see "Run protocol" below.

### Fields inside each file

```jsonc
{
  "benchVersion": 1,
  "generatedAt": "2026-09-13T14:21:01.122Z",
  "device": { "browser", "browserVersion", "engine", "os", "arch", "cores",
              "memoryGB", "gpu", "screen", "mobile", "userAgent" },
  "results": [                       // one entry per image
    { "file", "source", "width", "height", "error"?,
      "entries": [                   // one per group × format × quality
        { "group": "native" | "wasm", "format": "jpeg" | "webp" | "avif",
          "q": 10 | 40 | 60 | 80 | 92 | 100,
          "support": "ok" | "silent" | "unsupported",
          "actualType"?,             // when support != "ok": what the browser returned instead
          "sizeFull", "msFull",      // full-resolution encode (bytes / ms)
          "size1200", "dssim"        // 1200px analysis frame (bytes / dssim-core 3.4.0 score)
        }
      ] }
  ]
}
```

`support: "silent"` is the interesting failure mode: the browser returned a **different** type
(spec fallback) instead of throwing. Safari returns PNG for both WebP and AVIF; Chrome/Edge/Firefox
return PNG for AVIF.

## How the numbers were produced

- **Native group**: `canvas.toBlob(callback, mime, quality)` on the full-resolution canvas —
  one measured encode per cell.
- **WASM group**: the same canvas encoded by MozJPEG / libwebp / `@jsquash/avif` in dedicated
  Web Workers. The first encode per format (worker startup + `.wasm` compilation) is not measured.
- **Images**: four shared reference images, served from `cdn.pixkeep.app` and used by every run so
  results stay comparable: two 12 MP photos (3024×4032), one synthetic graphic with flat colors,
  sharp edges and text (2400×1600), one transparent PNG (2000×2000).
- **Quality levels**: 10 / 40 / 60 / 80 / 92 / 100.
- **Metric**: DSSIM via the official [`dssim-core`](https://github.com/kornelski/dssim) v3.4.0
  kernel (`dssim-wasm`), scored on a shared 1200 px center-crop analysis frame so every encoder
  sees identical framing. Lower is better. Cite it as "dssim-core 3.4.0 via dssim-wasm".

## Read this before citing the data

Two layers with very different durability:

| Layer | Fields | Comparable across… |
|---|---|---|
| **Deterministic** | `sizeFull`, `size1200`, `dssim`, `support`, `actualType` | Browsers/machines — these depend only on the **browser build and the input image**. Same browser version ⇒ same bytes, anywhere. |
| **Noisy** | `msFull` | **Only within one machine + browser version.** Single run, foreground, and sensitive to thermal state, power source and background load. Do **not** rank machines or browsers by these numbers. |

Also note:

- Quality scales are **not portable across encoders** — the same `q` means different things to
  different encoders. Compare at matched DSSIM or matched size.
- The transparent reference image is a pathological case for JPEG (alpha is flattened): its DSSIM
  scores are not meaningful as an encoder-quality signal and are excluded from comparisons.
- `device.os` is parsed from the user agent. Safari **freezes the macOS version** in its UA
  (`Mac OS X 10_15_7`) and Chromium's UA-CH reports `Windows 10.0.0` — treat those as unreliable
  and record the real OS version manually when adding runs.

## Run protocol

For a run to be worth publishing here, follow the same conditions we did:

1. **Foreground tab** for the whole run, machine otherwise idle; no other heavy apps.
2. **AC power**, low-power/battery-saver mode **off**; on macOS start `caffeinate -i` first
   (auto-sleep freezes the page while wall-clock time keeps running).
3. **One browser session per file**, all four reference images, all formats, all six quality levels.
4. **Record the browser version** (the file does this) and the **real OS version / machine model**
   (the file cannot do this reliably — annotate it when you add the file).
5. Export with the page's **Download JSON** button; do not edit the file.
6. Repeats: the plan is **3 repeats per environment** (to quantify the within-machine noise of
   `msFull`). The 2026-09-13 set is single-run; if you add repeats, keep them as separate files
   (suffix `-r1`, `-r2`, `-r3`) so raw evidence stays intact.

## Aggregate

```bash
# from the lab repo root (default target: this directory)
node scripts/aggregate-encode-bench.mjs

# any other directory of run files
node scripts/aggregate-encode-bench.mjs --dir tmp --focus grass1
```

It writes `report.md` next to the data (support matrix, per-image size/time tables, quality
response curves, byte-equality check, latency, methodology notes). Legacy-schema files (the
2026-08-29 first batch, which used an approximate DSSIM kernel and a 1200px-comparison layout)
are not comparable and are kept out of this directory.

## License

The measurement data in this directory is licensed **CC BY 4.0** — attribution:
"**PixKeep Lab** — https://lab.pixkeep.app/encode-matrix/". The harness and scripts are MIT
(see the repository `LICENSE`; the bundled DSSIM kernel is AGPL-3.0, see `third_party/dssim-wasm/`).

These are **our own runs**. A public contribution flow for third-party runs is not open yet — it
needs an explicit consent notice first, since the exported JSON contains browser/device details.
