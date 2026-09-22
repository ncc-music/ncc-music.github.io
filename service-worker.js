const CACHE_PREFIX = 'ncc-music-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v15`;
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/styles.css?v=20260922u',
    '/assets/app-icons/icon-192-v2.png',
    '/assets/app-icons/icon-512-v2.png',
    '/assets/app-icons/icon-maskable-512-v2.png',
    '/assets/app-icons/apple-touch-icon-v2.png',
    '/assets/cardu-skull-mustard.png?v=20260922hq',
    '/assets/player-cover.png',
    '/assets/player-cover-clean.jpg',
    '/assets/mixed-by-single-line.png?v=20260922phase2',
    '/assets/fonts/RoadRage-Regular.ttf',
    '/js/waveform-stream.js?v=20260920',
    '/js/gdrive-player.js?v=20260922h',
    '/js/detail-waveform.js?v=20260922o',
    '/js/tracklist-search.js?v=20260921b',
    '/js/sets.js?v=20260922c',
    '/js/content.js?v=20260921e',
    '/js/visits.js?v=20260914',
    '/js/pwa.js?v=20260922'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

const isPrivateRequest = url =>
    url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/audio/')
    || url.pathname === '/visits';

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || isPrivateRequest(url)) return;
    if (request.destination === 'audio' || request.destination === 'video') return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
                    }
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const fresh = fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            }).catch(() => null);
            if (cached) return cached;
            return fresh.then(response => response || caches.match(request, { ignoreSearch: true }));
        })
    );
});
