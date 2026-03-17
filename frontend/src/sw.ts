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
    const title = data.title ?? 'Kegelkasse'
    const body = data.body ?? ''
    const url = (data.url as string) ?? '/'
    const tag = data.tag ?? 'kegelkasse'

    // Broadcast to all open app windows so they can add it to the in-app notification list
    const broadcast = self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
            clients.forEach((c) => c.postMessage({ type: 'push-received', title, body, url, tag }))
        })

    event.waitUntil(
        Promise.all([
            broadcast,
            self.registration.showNotification(title, {
                body,
                icon: '/icon.svg',
                tag,
                data: { url },
            }),
        ])
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = (event.notification.data?.url as string) ?? '/'
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients: readonly WindowClient[]) => {
            // Find an existing window and navigate it to the target URL
            for (const c of windowClients) {
                if ('navigate' in c) {
                    ;(c as WindowClient).navigate(url)
                    return (c as WindowClient).focus()
                }
            }
            return self.clients.openWindow(url)
        })
    )
})
