const CACHE = 'korin-v1'
const ASSETS = ['/', '/index.html', '/logo-lattuga.png', '/logo-korin.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Deixa passar chamadas de API (Supabase, Anthropic)
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('api.anthropic') ||
      e.request.url.includes('/api/')) return

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
      }
      return res
    }).catch(() => caches.match('/index.html')))
  )
})
