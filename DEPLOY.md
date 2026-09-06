# Deploying lab

## Worker topology

| Domain | Binding |
|---|---|
| `lab.pixkeep.app` (custom domain) | Worker `opensource-lab` — static assets from `dist/` (`wrangler.jsonc`) |
| `cdn.pixkeep.app/bench-encode/*` (worker route) | Worker `set-cdn-no-cache` — sets `Cache-Control: no-cache` |

## Deploy

```bash
npm run build      # astro build → dist/
wrangler deploy    # worker name comes from wrangler.jsonc
```

Verify after each deploy:

```bash
wrangler versions list --name opensource-lab   # a new version for opensource-lab
curl -s https://lab.pixkeep.app/encode-matrix/ | grep -o '/_astro/[^"]*\.js'
#   → bundle hash should match the fresh build
curl -sI https://cdn.pixkeep.app/bench-encode/graphic-text.png | grep -i cache-control
#   → cache-control: no-cache
```

## Pitfalls (learned the hard way, 2026-09-05)

1. **`wrangler.jsonc` `name` is the single source of truth. Never rename the
   worker in the Cloudflare dashboard without updating it first.**
   If the name in `wrangler.jsonc` does not exist on the account, `wrangler deploy`
   silently *creates a brand-new worker* under that name instead of deploying to
   the renamed one. Result: a duplicate worker, the custom domain still serving
   the stale worker, and a "deployed but not live" bundle — while the Safari
   benchmark bug below kept reproducing. Recovery: sync the name (commit),
   `wrangler deploy`, verify `wrangler versions list`, then delete the duplicate
   in the dashboard — after checking its domain/route bindings first.

2. **Safari/WebKit serves *direct-navigation cache copies* (missing `Access-Control-Allow-Origin`)
   to CORS fetches of the same URL.**
   Opening a CDN file in the address bar caches it without ACAO; the next CORS
   `fetch()` of that URL receives the cached copy and fails. Symptom on the
   benchmark page: `fetching sample … attempt N failed` ×3, then `load fail` —
   in Safari only; Chrome is unaffected. Layers of defense (both live):
   - CDN worker `set-cdn-no-cache` → `Cache-Control: no-cache` on `/bench-encode/*` (the root fix)
   - the page sends `cache: 'no-store'` and `?retry=N` cache-busting on retries (commit `043cb3f`)