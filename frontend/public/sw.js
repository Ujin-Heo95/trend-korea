// v5: shell stale 캐시 사고 — 이전 SW(v4) 가 캐시한 옛 index.html 이 사라진
// JS hash 를 가리켜 흰화면 사고 (2026-04-12 안드로이드 태블릿 사용자 신고).
// activate 시 v4 이하 캐시 자동 정리 + navigation 응답을 매번 캐시 덮어쓰기.
const CACHE_NAME = 'weeklit-v5';
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

  // Navigation: network-first, **항상** 캐시 덮어쓰기 (오래된 shell hash 잔존 차단).
  // 핵심: fetch 성공 시 즉시 cache.put('/index.html', ...) 로 갱신 → 다음 오프라인
  // fallback 도 항상 최신 hash 를 가리킴. 이전 SW 가 install 시 한 번만 캐시하던 패턴이
  // 안드로이드 태블릿 흰화면 사고의 원인.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Default: network-first
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
