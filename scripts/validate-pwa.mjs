import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PWA validation failed: ${message}`)
  }
}

const manifest = JSON.parse(await read('apps/web/public/manifest.webmanifest'))
const indexHtml = await read('apps/web/index.html')
const serviceWorker = await read('apps/web/public/sw.js')
const registration = await read('apps/web/src/pwa/registerServiceWorker.ts')
const viteConfig = await read('apps/web/vite.config.ts')
const main = await read('apps/web/src/main.tsx')

assert(manifest.name === 'FieldRep OS', 'manifest name must remain FieldRep OS')
assert(manifest.short_name === 'FieldRep', 'manifest short_name must be FieldRep')
assert(manifest.lang === 'fa', 'manifest language must be Persian')
assert(manifest.dir === 'rtl', 'manifest direction must be RTL')
assert(manifest.start_url === '.', 'start_url must remain deployment-base relative')
assert(manifest.scope === '.', 'manifest scope must remain deployment-base relative')
assert(manifest.display === 'standalone', 'display mode must be standalone')

const icons = Array.isArray(manifest.icons) ? manifest.icons : []
assert(
  icons.some((icon) => icon.src === 'icons/app-icon-192.png' && icon.sizes === '192x192' && icon.type === 'image/png'),
  'manifest must include a base-relative 192x192 PNG icon',
)
assert(
  icons.some((icon) => icon.src === 'icons/app-icon-512.png' && icon.sizes === '512x512' && icon.type === 'image/png'),
  'manifest must include a base-relative 512x512 PNG icon',
)
assert(
  icons.some((icon) => icon.src === 'icons/app-icon-512.png' && String(icon.purpose).includes('maskable')),
  '512x512 icon must support maskable installation surfaces',
)

const shortcutUrls = new Set((manifest.shortcuts ?? []).map((shortcut) => shortcut.url))
for (const requiredShortcut of ['planner', 'visit/new', 'calendar']) {
  assert(shortcutUrls.has(requiredShortcut), `missing required shortcut ${requiredShortcut}`)
}

assert(indexHtml.includes('rel="manifest" href="./manifest.webmanifest"'), 'index.html must use a base-relative manifest link')
assert(indexHtml.includes('rel="apple-touch-icon" href="./icons/app-icon-192.png"'), 'index.html must expose a base-relative Apple touch icon')

assert(serviceWorker.includes("request.method !== 'GET'"), 'service worker must ignore non-GET requests')
assert(serviceWorker.includes('url.origin !== self.location.origin'), 'service worker must reject cross-origin caching')
assert(serviceWorker.includes("scopedPath('api/')"), 'service worker must derive a scoped API prefix')
assert(serviceWorker.includes('url.pathname.startsWith(apiPrefix)'), 'service worker must bypass scoped API traffic')
assert(!serviceWorker.match(/CORE_ASSETS[^\n]*api/), 'core shell assets must never include API routes')
assert(serviceWorker.includes("scopedPath('manifest.webmanifest')"), 'manifest must be part of the shell cache')
assert(serviceWorker.includes("scopedPath('icons/app-icon-192.png')"), '192px PNG icon must be part of the shell cache')
assert(serviceWorker.includes("scopedPath('icons/app-icon-512.png')"), '512px PNG icon must be part of the shell cache')
assert(serviceWorker.includes('self.registration.scope'), 'service worker paths must derive from the active scope')

assert(registration.includes('import.meta.env.PROD'), 'service worker registration must remain production-only')
assert(registration.includes('import.meta.env.BASE_URL'), 'service worker registration must use the deployment base')
assert(registration.includes('serviceWorkerUrl'), 'service worker URL must be derived from the deployment base')
assert(registration.includes('{ scope: base }'), 'service worker scope must match the deployment base')
assert(viteConfig.includes("process.env.VITE_APP_BASE ?? '/'"), 'Vite must allow an explicit deployment base')
assert(main.includes('basename={import.meta.env.BASE_URL}'), 'BrowserRouter must respect the deployment base')

console.log('PWA security/installability source validation: PASS')
