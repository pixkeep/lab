# Encode-matrix benchmark report

Generated: 2026-09-13T15:00:10.087Z

Sources (4 environments):
- `2026-09-13-windows-chrome-153.json` — 2026-09-13T14:06:41.162Z
- `2026-09-13-windows-edge-153.json` — 2026-09-13T13:53:27.283Z
- `2026-09-13-windows-firefox-155.json` — 2026-09-13T14:21:01.122Z
- `2026-09-13-macos-safari-18.6.json` — 2026-09-13T13:30:56.594Z

## Environments

| browser | engine | OS | cores | memory | GPU | screen | JSON schema |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | Blink | Windows 10.0.0 | 8 | ≈16 GB | ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1536x864 @1.25x | lab |
| Edge 153.0.0.0 | Blink | Windows 10.0.0 | 8 | ≈16 GB | ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1536x864 @1.25x | lab |
| Firefox 155.0 | Gecko | Windows | 8 | not exposed | ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar | 1536x864 @1.25x | lab |
| Safari 18.6 | WebKit | macOS 10.15.7 | 8 | not exposed | Apple GPU | 1440x900 @2x | lab |

## Native toBlob support matrix (canvas.toBlob)

| browser | JPEG | WebP | AVIF |
|---|---|---|---|
| Chrome 153.0.0.0 | ok | ok | silent→image/png (24/24) |
| Edge 153.0.0.0 | ok | ok | silent→image/png (24/24) |
| Firefox 155.0 | ok | ok | silent→image/png (24/24) |
| Safari 18.6 | ok | silent→image/png (24/24) | silent→image/png (24/24) |

`ok` = returned blob type matches the requested type. `silent→…` = the browser silently returned a different type (PNG). Counts are cells across all images × quality levels.

## WASM reference encoders (same JSONs, control group)

| browser | format | cells | ok | failed | first failure |
|---|---|---|---|---|---|
| Chrome | jpeg | 24 | 24 | 0 | — |
| Chrome | webp | 24 | 24 | 0 | — |
| Chrome | avif | 24 | 24 | 0 | — |
| Edge | jpeg | 24 | 24 | 0 | — |
| Edge | webp | 24 | 24 | 0 | — |
| Edge | avif | 24 | 24 | 0 | — |
| Firefox | jpeg | 24 | 24 | 0 | — |
| Firefox | webp | 24 | 24 | 0 | — |
| Firefox | avif | 24 | 24 | 0 | — |
| Safari | jpeg | 24 | 24 | 0 | — |
| Safari | webp | 24 | 24 | 0 | — |
| Safari | avif | 24 | 24 | 0 | — |

## alpha-transparent.png — @q80 full-res, native vs WASM

| browser | format | native size | native time | native dssim | wasm size | wasm time | wasm dssim |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | jpeg | 0.05 MB | 47ms | 1.09374 | 0.06 MB | 761ms | 0.99431 |
| Chrome 153.0.0.0 | webp | 0.04 MB | 405ms | 0.00008 | 0.04 MB | 792ms | 0.00007 |
| Chrome 153.0.0.0 | avif | silent→image/png | — | — | 0.03 MB | 2.2s | 0.00005 |
| Edge 153.0.0.0 | jpeg | 0.05 MB | 47ms | 1.09374 | 0.06 MB | 766ms | 0.99431 |
| Edge 153.0.0.0 | webp | 0.04 MB | 445ms | 0.00008 | 0.04 MB | 805ms | 0.00007 |
| Edge 153.0.0.0 | avif | silent→image/png | — | — | 0.03 MB | 2.3s | 0.00005 |
| Firefox 155.0 | jpeg | 0.09 MB | 17ms | 1.09271 | 0.06 MB | 878ms | 0.99342 |
| Firefox 155.0 | webp | 0.04 MB | 537ms | 0.00009 | 0.04 MB | 947ms | 0.00009 |
| Firefox 155.0 | avif | silent→image/png | — | — | 0.03 MB | 2.5s | 0.00007 |
| Safari 18.6 | jpeg | 0.11 MB | 48ms | 1.09368 | 0.06 MB | 931ms | 0.99433 |
| Safari 18.6 | webp | silent→image/png | — | — | 0.04 MB | 1.0s | 0.00007 |
| Safari 18.6 | avif | silent→image/png | — | — | 0.03 MB | 2.7s | 0.00004 |

## flower1.png — @q80 full-res, native vs WASM

| browser | format | native size | native time | native dssim | wasm size | wasm time | wasm dssim |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | jpeg | 3.53 MB | 209ms | 0.00205 | 2.94 MB | 4.4s | 0.00221 |
| Chrome 153.0.0.0 | webp | 3.25 MB | 2.3s | 0.00134 | 3.25 MB | 4.0s | 0.00133 |
| Chrome 153.0.0.0 | avif | silent→image/png | — | — | 4.43 MB | 26.9s | 0.00072 |
| Edge 153.0.0.0 | jpeg | 3.53 MB | 205ms | 0.00205 | 2.94 MB | 4.5s | 0.00221 |
| Edge 153.0.0.0 | webp | 3.25 MB | 2.3s | 0.00134 | 3.25 MB | 4.1s | 0.00133 |
| Edge 153.0.0.0 | avif | silent→image/png | — | — | 4.43 MB | 26.1s | 0.00072 |
| Firefox 155.0 | jpeg | 3.56 MB | 82ms | 0.00205 | 2.94 MB | 5.3s | 0.00221 |
| Firefox 155.0 | webp | 3.25 MB | 1.8s | 0.00133 | 3.25 MB | 4.5s | 0.00133 |
| Firefox 155.0 | avif | silent→image/png | — | — | 4.43 MB | 27.8s | 0.00064 |
| Safari 18.6 | jpeg | 6.06 MB | 247ms | 0.00063 | 2.94 MB | 4.9s | 0.00221 |
| Safari 18.6 | webp | silent→image/png | — | — | 3.25 MB | 5.4s | 0.00133 |
| Safari 18.6 | avif | silent→image/png | — | — | 4.43 MB | 32.5s | 0.00064 |

## graphic-text.png — @q80 full-res, native vs WASM

| browser | format | native size | native time | native dssim | wasm size | wasm time | wasm dssim |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | jpeg | 0.12 MB | 55ms | 0.00029 | 0.09 MB | 1.1s | 0.00034 |
| Chrome 153.0.0.0 | webp | 0.05 MB | 242ms | 0.00021 | 0.05 MB | 589ms | 0.00021 |
| Chrome 153.0.0.0 | avif | silent→image/png | — | — | 0.04 MB | 1.4s | 0.00013 |
| Edge 153.0.0.0 | jpeg | 0.12 MB | 54ms | 0.00029 | 0.09 MB | 808ms | 0.00034 |
| Edge 153.0.0.0 | webp | 0.05 MB | 259ms | 0.00021 | 0.05 MB | 567ms | 0.00021 |
| Edge 153.0.0.0 | avif | silent→image/png | — | — | 0.04 MB | 1.4s | 0.00013 |
| Firefox 155.0 | jpeg | 0.15 MB | 17ms | 0.00029 | 0.09 MB | 909ms | 0.00034 |
| Firefox 155.0 | webp | 0.05 MB | 234ms | 0.00021 | 0.05 MB | 662ms | 0.00021 |
| Firefox 155.0 | avif | silent→image/png | — | — | 0.04 MB | 1.7s | 0.00010 |
| Safari 18.6 | jpeg | 0.19 MB | 44ms | 0.00012 | 0.09 MB | 923ms | 0.00034 |
| Safari 18.6 | webp | silent→image/png | — | — | 0.05 MB | 677ms | 0.00021 |
| Safari 18.6 | avif | silent→image/png | — | — | 0.04 MB | 1.7s | 0.00010 |

## grass1.png — @q80 full-res, native vs WASM

| browser | format | native size | native time | native dssim | wasm size | wasm time | wasm dssim |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | jpeg | 4.27 MB | 220ms | 0.00170 | 3.43 MB | 5.3s | 0.00264 |
| Chrome 153.0.0.0 | webp | 4.17 MB | 2.2s | 0.00123 | 4.17 MB | 4.5s | 0.00121 |
| Chrome 153.0.0.0 | avif | silent→image/png | — | — | 5.43 MB | 28.6s | 0.00051 |
| Edge 153.0.0.0 | jpeg | 4.27 MB | 238ms | 0.00170 | 3.43 MB | 4.7s | 0.00264 |
| Edge 153.0.0.0 | webp | 4.17 MB | 2.2s | 0.00123 | 4.17 MB | 4.4s | 0.00121 |
| Edge 153.0.0.0 | avif | silent→image/png | — | — | 5.43 MB | 28.9s | 0.00051 |
| Firefox 155.0 | jpeg | 4.33 MB | 99ms | 0.00172 | 3.43 MB | 6.0s | 0.00265 |
| Firefox 155.0 | webp | 4.17 MB | 2.0s | 0.00121 | 4.17 MB | 4.8s | 0.00121 |
| Firefox 155.0 | avif | silent→image/png | — | — | 5.43 MB | 30.2s | 0.00052 |
| Safari 18.6 | jpeg | 7.13 MB | 276ms | 0.00033 | 3.43 MB | 5.8s | 0.00265 |
| Safari 18.6 | webp | silent→image/png | — | — | 4.17 MB | 5.9s | 0.00122 |
| Safari 18.6 | avif | silent→image/png | — | — | 5.43 MB | 33.8s | 0.00052 |

## Quality response — native full-res size, flower1.png

| browser | format | q10 | q40 | q60 | q80 | q92 | q100 |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | jpeg | 0.67 | 1.74 | 2.32 | 3.53 | 5.56 | 15.60 |
| Chrome 153.0.0.0 | webp | 0.89 | 1.83 | 2.33 | 3.25 | 5.05 | 16.10 |
| Chrome 153.0.0.0 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Edge 153.0.0.0 | jpeg | 0.67 | 1.74 | 2.32 | 3.53 | 5.56 | 15.60 |
| Edge 153.0.0.0 | webp | 0.89 | 1.83 | 2.33 | 3.25 | 5.05 | 16.10 |
| Edge 153.0.0.0 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Firefox 155.0 | jpeg | 0.75 | 1.77 | 2.33 | 3.56 | 6.66 | 17.52 |
| Firefox 155.0 | webp | 0.88 | 1.82 | 2.32 | 3.25 | 5.06 | 15.16 |
| Firefox 155.0 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Safari 18.6 | jpeg | 1.16 | 2.37 | 4.16 | 6.06 | 7.39 | 17.69 |
| Safari 18.6 | webp | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Safari 18.6 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |

## Quality response — native DSSIM (official dssim-core 3.4.0), flower1.png

| browser | format | q10 | q40 | q60 | q80 | q92 | q100 |
|---|---|---|---|---|---|---|---|
| Chrome 153.0.0.0 | jpeg | 0.02871 | 0.00694 | 0.00440 | 0.00205 | 0.00076 | 0.00003 |
| Chrome 153.0.0.0 | webp | 0.01328 | 0.00432 | 0.00267 | 0.00134 | 0.00062 | 0.00000 |
| Chrome 153.0.0.0 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Edge 153.0.0.0 | jpeg | 0.02871 | 0.00694 | 0.00440 | 0.00205 | 0.00076 | 0.00003 |
| Edge 153.0.0.0 | webp | 0.01328 | 0.00432 | 0.00267 | 0.00134 | 0.00062 | 0.00000 |
| Edge 153.0.0.0 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Firefox 155.0 | jpeg | 0.02869 | 0.00693 | 0.00440 | 0.00205 | 0.00037 | 0.00003 |
| Firefox 155.0 | webp | 0.01321 | 0.00429 | 0.00265 | 0.00133 | 0.00061 | 0.00000 |
| Firefox 155.0 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Safari 18.6 | jpeg | 0.01286 | 0.00402 | 0.00137 | 0.00063 | 0.00050 | 0.00003 |
| Safari 18.6 | webp | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |
| Safari 18.6 | avif | silent→? | silent→? | silent→? | silent→png | silent→? | silent→? |

## Byte-equality check — native WebP vs libwebp (WASM)

| browser | image | q | native bytes | libwebp bytes | identical |
|---|---|---|---|---|---|
| Chrome 153.0.0.0 | alpha-transparent.png | 10 | 35064 | 34654 | ❌ |
| Chrome 153.0.0.0 | alpha-transparent.png | 40 | 36312 | 35970 | ❌ |
| Chrome 153.0.0.0 | alpha-transparent.png | 60 | 37828 | 37456 | ❌ |
| Chrome 153.0.0.0 | alpha-transparent.png | 80 | 41234 | 40890 | ❌ |
| Chrome 153.0.0.0 | alpha-transparent.png | 92 | 49878 | 49536 | ❌ |
| Chrome 153.0.0.0 | alpha-transparent.png | 100 | 978312 | 58124 | ❌ |
| Chrome 153.0.0.0 | flower1.png | 10 | 932398 | 933858 | ❌ |
| Chrome 153.0.0.0 | flower1.png | 40 | 1921842 | 1923892 | ❌ |
| Chrome 153.0.0.0 | flower1.png | 60 | 2438898 | 2441376 | ❌ |
| Chrome 153.0.0.0 | flower1.png | 80 | 3408350 | 3411476 | ❌ |
| Chrome 153.0.0.0 | flower1.png | 92 | 5298190 | 5303184 | ❌ |
| Chrome 153.0.0.0 | flower1.png | 100 | 16884868 | 7903726 | ❌ |
| Chrome 153.0.0.0 | graphic-text.png | 10 | 28892 | 28626 | ❌ |
| Chrome 153.0.0.0 | graphic-text.png | 40 | 36916 | 36446 | ❌ |
| Chrome 153.0.0.0 | graphic-text.png | 60 | 41986 | 41542 | ❌ |
| Chrome 153.0.0.0 | graphic-text.png | 80 | 51034 | 50568 | ❌ |
| Chrome 153.0.0.0 | graphic-text.png | 92 | 71274 | 70804 | ❌ |
| Chrome 153.0.0.0 | graphic-text.png | 100 | 410178 | 99202 | ❌ |
| Chrome 153.0.0.0 | grass1.png | 10 | 1357024 | 1360278 | ❌ |
| Chrome 153.0.0.0 | grass1.png | 40 | 2675786 | 2679002 | ❌ |
| Chrome 153.0.0.0 | grass1.png | 60 | 3292152 | 3295528 | ❌ |
| Chrome 153.0.0.0 | grass1.png | 80 | 4374128 | 4376822 | ❌ |
| Chrome 153.0.0.0 | grass1.png | 92 | 6490956 | 6493940 | ❌ |
| Chrome 153.0.0.0 | grass1.png | 100 | 19006336 | 9180312 | ❌ |
| Edge 153.0.0.0 | alpha-transparent.png | 10 | 35064 | 34654 | ❌ |
| Edge 153.0.0.0 | alpha-transparent.png | 40 | 36312 | 35970 | ❌ |
| Edge 153.0.0.0 | alpha-transparent.png | 60 | 37828 | 37456 | ❌ |
| Edge 153.0.0.0 | alpha-transparent.png | 80 | 41234 | 40890 | ❌ |
| Edge 153.0.0.0 | alpha-transparent.png | 92 | 49878 | 49536 | ❌ |
| Edge 153.0.0.0 | alpha-transparent.png | 100 | 978312 | 58124 | ❌ |
| Edge 153.0.0.0 | flower1.png | 10 | 932398 | 933858 | ❌ |
| Edge 153.0.0.0 | flower1.png | 40 | 1921842 | 1923892 | ❌ |
| Edge 153.0.0.0 | flower1.png | 60 | 2438898 | 2441376 | ❌ |
| Edge 153.0.0.0 | flower1.png | 80 | 3408350 | 3411476 | ❌ |
| Edge 153.0.0.0 | flower1.png | 92 | 5298190 | 5303184 | ❌ |
| Edge 153.0.0.0 | flower1.png | 100 | 16884868 | 7903726 | ❌ |
| Edge 153.0.0.0 | graphic-text.png | 10 | 28892 | 28626 | ❌ |
| Edge 153.0.0.0 | graphic-text.png | 40 | 36916 | 36446 | ❌ |
| Edge 153.0.0.0 | graphic-text.png | 60 | 41986 | 41542 | ❌ |
| Edge 153.0.0.0 | graphic-text.png | 80 | 51034 | 50568 | ❌ |
| Edge 153.0.0.0 | graphic-text.png | 92 | 71274 | 70804 | ❌ |
| Edge 153.0.0.0 | graphic-text.png | 100 | 410178 | 99202 | ❌ |
| Edge 153.0.0.0 | grass1.png | 10 | 1357024 | 1360278 | ❌ |
| Edge 153.0.0.0 | grass1.png | 40 | 2675786 | 2679002 | ❌ |
| Edge 153.0.0.0 | grass1.png | 60 | 3292152 | 3295528 | ❌ |
| Edge 153.0.0.0 | grass1.png | 80 | 4374128 | 4376822 | ❌ |
| Edge 153.0.0.0 | grass1.png | 92 | 6490956 | 6493940 | ❌ |
| Edge 153.0.0.0 | grass1.png | 100 | 19006336 | 9180312 | ❌ |
| Firefox 155.0 | alpha-transparent.png | 10 | 35356 | 35444 | ❌ |
| Firefox 155.0 | alpha-transparent.png | 40 | 37576 | 37794 | ❌ |
| Firefox 155.0 | alpha-transparent.png | 60 | 39166 | 39144 | ❌ |
| Firefox 155.0 | alpha-transparent.png | 80 | 43000 | 43186 | ❌ |
| Firefox 155.0 | alpha-transparent.png | 92 | 52304 | 52458 | ❌ |
| Firefox 155.0 | alpha-transparent.png | 100 | 24112 | 62134 | ❌ |
| Firefox 155.0 | flower1.png | 10 | 921106 | 921106 | ✅ |
| Firefox 155.0 | flower1.png | 40 | 1904804 | 1904804 | ✅ |
| Firefox 155.0 | flower1.png | 60 | 2434822 | 2434822 | ✅ |
| Firefox 155.0 | flower1.png | 80 | 3411308 | 3411308 | ✅ |
| Firefox 155.0 | flower1.png | 92 | 5303538 | 5303538 | ✅ |
| Firefox 155.0 | flower1.png | 100 | 15893016 | 7904266 | ❌ |
| Firefox 155.0 | graphic-text.png | 10 | 28626 | 28626 | ✅ |
| Firefox 155.0 | graphic-text.png | 40 | 36446 | 36446 | ✅ |
| Firefox 155.0 | graphic-text.png | 60 | 41542 | 41542 | ✅ |
| Firefox 155.0 | graphic-text.png | 80 | 50568 | 50568 | ✅ |
| Firefox 155.0 | graphic-text.png | 92 | 70804 | 70804 | ✅ |
| Firefox 155.0 | graphic-text.png | 100 | 28772 | 99202 | ❌ |
| Firefox 155.0 | grass1.png | 10 | 1356188 | 1356188 | ✅ |
| Firefox 155.0 | grass1.png | 40 | 2675292 | 2675292 | ✅ |
| Firefox 155.0 | grass1.png | 60 | 3290448 | 3290448 | ✅ |
| Firefox 155.0 | grass1.png | 80 | 4372156 | 4372156 | ✅ |
| Firefox 155.0 | grass1.png | 92 | 6488208 | 6488208 | ✅ |
| Firefox 155.0 | grass1.png | 100 | 18522318 | 9180712 | ❌ |

## Encode latency — native @q80, flower1.png

| browser | JPEG | WebP | WASM libwebp | WASM MozJPEG | WASM AVIF |
|---|---|---|---|---|---|
| Chrome 153.0.0.0 | 209ms | 2.3s | 4.0s | 4.4s | 26.9s |
| Edge 153.0.0.0 | 205ms | 2.3s | 4.1s | 4.5s | 26.1s |
| Firefox 155.0 | 82ms | 1.8s | 4.5s | 5.3s | 27.8s |
| Safari 18.6 | 247ms | — | 5.4s | 4.9s | 32.5s |

---

Methodology notes:
- One measured full-resolution encode per (image × format × quality × group) cell; foreground tab, single run.
- DSSIM = official dssim-core v3.4.0 via dssim-wasm, scored on a shared 1200px center-crop analysis frame.
- Quality scales are NOT comparable across encoders — compare at matched DSSIM or matched size.
- Latency is single-run and machine/thermal dependent: comparable within one machine, not across machines.
- Native AVIF: no browser tested can encode it (all silently return PNG) — the WASM column is the only AVIF datapoint.
