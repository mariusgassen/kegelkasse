/// <reference lib="WebWorker" />
/// <reference types="vite-plugin-pwa/vanillajs" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope
declare const __BUILD_HASH__: string

// Take control immediately when a new SW version installs — prevents stale UI after deploy
self.skipWaiting()
clientsClaim()

// Precache & route injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Delete caches from previous builds (cache names include build hash)
self.addEventListener('activate', (event) => {
    const currentCaches = new Set([
        `google-fonts-${__BUILD_HASH__}`,
        `api-cache-${__BUILD_HASH__}`,
    ])
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => (key.startsWith('google-fonts-') || key.startsWith('api-cache-')) && !currentCaches.has(key))
                    .map((key) => caches.delete(key))
            )
        )
    )
})

// SPA navigation fallback — exclude /docs so those routes reach the server
registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
        denylist: [/^\/docs(\/.*)?$/],
    })
)

// Google Fonts
registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com',
    new CacheFirst({
        cacheName: `google-fonts-${__BUILD_HASH__}`,
        plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 })],
    })
)

// API: network first — exclude SSE event streams (they are long-lived, not cacheable)
registerRoute(
    ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.endsWith('/events'),
    new NetworkFirst({
        cacheName: `api-cache-${__BUILD_HASH__}`,
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 })],
    })
)

// ── Push notifications ──

self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {}
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'Kegelkasse', {
            body: data.body ?? '',
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: data.tag ?? 'kegelkasse',
            data: { url: (data.url as string) ?? '/' },
        })
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = (event.notification.data?.url as string) ?? '/'
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients: readonly WindowClient[]) => {
            for (const c of windowClients) {
                if ('focus' in c) return (c as WindowClient).focus()
            }
            return self.clients.openWindow(url)
        })
    )
})
