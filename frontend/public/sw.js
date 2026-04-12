const CACHE_NAME = 'weeklit-v4';
const API_CACHE = 'weeklit-api-v2';
const SHELL_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const KEEP = [CACHE_NAME, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API GET: network-first with cache fallback.
  // 이전: stale-while-revalidate → 사용자가 영원히 한 단계 stale 데이터를 봄
  //       (캐시 즉시 반환 후 백그라운드 갱신, 새 응답은 *다음* 새로고침에야 보임).
  //       종합 탭 이슈 카드가 11:21 갱신 후에도 안 바뀐 근본 원인.
  // 변경: 매번 network 우선. network 실패 시에만 캐시 fallback (오프라인 대비).
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || Promise.reject(new Error('offline'))))
    );
    return;
  }

  // API non-GET (POST, etc.): network-only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets (hashed by Vite): cache-first
  if (url.pathname.match(/\/assets\//)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Navigation: network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Default: network-first
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
