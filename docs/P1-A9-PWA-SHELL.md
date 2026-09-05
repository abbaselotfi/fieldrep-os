# P1-A9 — PWA Install & Static Shell Foundation

## Goal

Make the Field User web application installable and provide a conservative offline application-shell baseline without implementing P4 business-data synchronization early.

## Implemented

- Web App Manifest with RTL/Persian metadata.
- Standalone display mode.
- App shortcuts for Planner, Visit and Calendar.
- Scalable application icons with a maskable-safe visual area.
- Production-only service-worker registration.
- Versioned shell/runtime caches.
- Navigation fallback to cached `index.html` when the network is unavailable.
- Same-origin static asset runtime caching after successful fetch.
- Explicit exclusion of `/api/*` from service-worker caching.
- Old cache cleanup on activation.

## Security / data boundary

P1-A9 does **not** cache:

- API responses.
- Authentication/session endpoints.
- Doctor/customer business records through a data cache.
- Plans, visits or reports as offline domain data.

Those capabilities belong to P4, where IndexedDB, workspace/user isolation, queueing, idempotency and conflict handling are implemented together.

## Service-worker strategy

### Navigation

Network first. When offline, use a previously cached route response or the cached application shell.

### Public static assets

Cache-then-refresh for same-origin script/style/image/font/manifest requests.

### API

Bypass service worker completely.

## Development behavior

The service worker is registered only in production builds so local Vite development is not polluted by stale service-worker caches.

## Production deployment requirement

PWA behavior requires HTTPS (localhost is the browser development exception). The eventual Cloudflare staging deployment must verify:

1. manifest is reachable with the expected content type;
2. service worker is served from `/sw.js` and controls `/`;
3. app installs in Chromium-based browsers;
4. navigation shell opens after a prior online load while offline;
5. `/api` responses are never returned from Cache Storage;
6. authenticated business-data offline behavior remains disabled until P4.

## Deferred polish

- Platform-specific raster icon set / Apple touch icon if required by final brand QA.
- Screenshots in the manifest.
- In-app install prompt UX.
- Update-available banner.
- Offline domain cache and sync state UI (P4).
