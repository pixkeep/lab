import { defineConfig } from 'astro/config';

// PixKeep Lab — static site, deployed on Cloudflare Pages at lab.pixkeep.app.
export default defineConfig({
  site: 'https://lab.pixkeep.app',
  output: 'static',
  vite: {
    resolve: {
      // ONNX Runtime Web ships its WebGPU entry in two builds. The default one
      // embeds the wasm loader script: Vite then re-emits the 26.9 MB .wasm as a
      // page asset (over Cloudflare's 25 MiB per-file limit), and the runtime
      // imports the loader through a blob: URL, which the lab CSP refuses.
      // /background-removal/ serves both files itself from /ort/.
      conditions: ['onnxruntime-web-use-extern-wasm'],
    },
  },
});
