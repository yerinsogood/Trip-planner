/* 오프라인에서도 앱이 열리게: 온라인이면 최신 파일, 안 되면(3초) 저장해둔 파일 */
const CACHE = 'trip-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.json', 'icon.svg', 'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/supabase.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req.mode === 'navigate' ? 'index.html' : req, res.clone()); return res; });
    if (!cached) return net;
    net.catch(() => {});
    const timeout = new Promise((r) => setTimeout(() => r(cached), 3000));
    return Promise.race([net.catch(() => cached), timeout]);
  })());
});
