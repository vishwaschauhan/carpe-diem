// Offline support: network-first for pages (so deploys show up), cache-first for hashed assets.
const CACHE = 'carpe-diem-v2.1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Leave Firebase and other cross-origin traffic alone (Firestore streams must not be cached).
  if (url.origin !== location.origin && !url.hostname.startsWith('fonts.g')) return
  if (url.pathname.startsWith('/__/')) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone()
      caches.open(CACHE).then(c => c.put('./index.html', copy))
      return res
    }).catch(() => caches.match('./index.html')))
    return
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then(c => c.put(req, copy))
    }
    return res
  })))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list[0] ? list[0].focus() : self.clients.openWindow('./')))
})
