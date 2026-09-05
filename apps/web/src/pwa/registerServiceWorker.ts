export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const base = import.meta.env.BASE_URL
  const serviceWorkerUrl = `${base}sw.js`

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(serviceWorkerUrl, { scope: base }).catch((error: unknown) => {
      console.error('FieldRep OS service worker registration failed', error)
    })
  })
}
