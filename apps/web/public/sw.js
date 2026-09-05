const SHELL_CACHE = 'fieldrep-shell-v1'
const RUNTIME_CACHE = 'fieldrep-runtime-v1'
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/app-icon-192.png', '/icons/app-icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(CORE_ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match('/index.html')) ?? Response.error()),
    )
    return
  }

  if (['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch(() => cached ?? Response.error())

        return cached ?? network
      }),
    )
  }
})
