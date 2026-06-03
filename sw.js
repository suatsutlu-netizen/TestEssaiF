/* ═══════════════════════════════════════════════════════
   ESSAIS DE FREIN — sw.js
   Service Worker : Cache-First + Network Fallback
   Stratégie Offline-First pour GitHub Pages
═══════════════════════════════════════════════════════ */

'use strict';

const CACHE_NAME = 'essais-frein-v1.0.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Google Fonts (optionnel, mis en cache au premier accès)
];

/* ── INSTALL : pré-cache les assets critiques ──────── */
self.addEventListener('install', event => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core assets');
        // Use individual adds to avoid failing the whole install if one asset 404s
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => cache.add(url).catch(e => {
            console.warn('[SW] Failed to cache:', url, e);
          }))
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE : supprime les anciens caches ─────────── */
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ── FETCH : Cache-First, Network Fallback ──────────── */
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ne pas intercepter les requêtes chrome-extension etc.
  const url = new URL(event.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          // Retourner depuis le cache ET mettre à jour en arrière-plan (stale-while-revalidate)
          const networkFetch = fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
              return networkResponse;
            })
            .catch(() => null);
          // On retourne le cache immédiatement
          return cached;
        }

        // Pas dans le cache → réseau
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
              return networkResponse;
            }
            // Mettre en cache pour la prochaine fois
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(() => {
            // Fallback pour les pages HTML
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
            return new Response('Ressource non disponible hors ligne.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          });
      })
  );
});

/* ── MESSAGE : Force update ──────────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
