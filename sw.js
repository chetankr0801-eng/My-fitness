/* ══════════════════════════════════════════════════════════════
   FitSystem Service Worker  v1.0.0
   Cache-first for static assets, network-first for dynamic.
   API calls (api.anthropic.com) always bypass — never cached.
══════════════════════════════════════════════════════════════ */
const CACHE_NAME    = 'fit-system-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
];

/* ── INSTALL: pre-cache static shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('[SW] Pre-cache failed (non-fatal):', err))
  );
  self.skipWaiting();
});

/* ── ACTIVATE: delete stale caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      ))
      .then(() => clients.claim())
  );
});

/* ── FETCH: routing strategy ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* 1. Never intercept Anthropic API — must reach network */
  if (url.hostname === 'api.anthropic.com') return;

  /* 2. Only handle GET requests */
  if (request.method !== 'GET') return;

  /* 3. Google Fonts — stale-while-revalidate */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  /* 4. App shell + static assets — cache-first, network fallback */
  event.respondWith(cacheFirstWithFallback(request));
});

/* ── Strategy: cache-first, update cache in background ── */
async function cacheFirstWithFallback(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Background refresh (don't block response)
    fetchAndCache(request).catch(() => {});
    return cached;
  }
  try {
    return await fetchAndCache(request);
  } catch {
    // Last resort: return a minimal offline response
    return new Response(
      '<html><body style="font-family:sans-serif;padding:2rem;background:#0e0e0e;color:#888">' +
      '<h2 style="color:#3ddc84">FitSystem</h2><p>You are offline. Open the app when connected.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/* ── Strategy: stale-while-revalidate ── */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetchAndCache(request).catch(() => null);
  return cached || await fetchPromise;
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response && response.status === 200) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
