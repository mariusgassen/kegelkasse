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

// SPA navigation fallback — exclude /api/docs/docs so those routes reach the server
registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
        denylist: [/^\/(api\/)?docs(\/.*)?$/],
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

/** Read JWT from the kegelkasse_auth IndexedDB written by the main app. */
function getStoredToken(): Promise<string | null> {
    return new Promise((resolve) => {
        const req = indexedDB.open('kegelkasse_auth', 1)
        req.onerror = () => resolve(null)
        req.onupgradeneeded = (e) => {
            // DB didn't exist yet — create the store so onsuccess fires, then close
            ;(e.target as IDBOpenDBRequest).result.createObjectStore('tokens')
        }
        req.onsuccess = () => {
            const db = req.result
            if (!db.objectStoreNames.contains('tokens')) {
                db.close()
                resolve(null)
                return
            }
            const tx = db.transaction('tokens', 'readonly')
            const getReq = tx.objectStore('tokens').get('jwt')
            getReq.onsuccess = () => { db.close(); resolve((getReq.result as string) ?? null) }
            getReq.onerror = () => { db.close(); resolve(null) }
        }
    })
}

/** Store a missed push notification in IndexedDB so the app can pick it up on next boot. */
function storeMissedPush(title: string, body: string, url: string): Promise<void> {
    return new Promise((resolve) => {
        const req = indexedDB.open('kegelkasse_notifications', 1)
        req.onupgradeneeded = (e) => {
            ;(e.target as IDBOpenDBRequest).result.createObjectStore('missed', {autoIncrement: true})
        }
        req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('missed', 'readwrite')
            tx.objectStore('missed').add({title, body, url, receivedAt: new Date().toISOString()})
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => { db.close(); resolve() }
        }
        req.onerror = () => resolve()
    })
}

self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {}
    const title = data.title ?? 'Kegelkasse'
    const body = data.body ?? ''
    const url = (data.url as string) ?? '/'
    const tag = (data.tag as string) ?? 'kegelkasse'
    const actions = (data.actions as {action: string; title: string}[]) ?? []
    const rid = data.rid as number | undefined

    // Always store in IndexedDB (for when app boots later) AND broadcast to open windows
    const broadcastAndStore = Promise.all([
        storeMissedPush(title, body, url),
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => clients.forEach((c) => c.postMessage({ type: 'push-received', title, body, url, tag }))),
    ])

    event.waitUntil(
        Promise.all([
            broadcastAndStore,
            self.registration.showNotification(title, {
                body,
                icon: '/icon.svg',
                tag,
                data: { url, rid },
                ...(actions.length ? {actions} as object : {}),
            } as NotificationOptions),
        ])
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const notifData = event.notification.data ?? {}
    const url = (notifData.url as string) ?? '/'
    const rid = notifData.rid as number | undefined
    const action = event.action

    // Handle payment-request action buttons (confirm / reject)
    if ((action === 'confirm' || action === 'reject') && rid) {
        event.waitUntil(
            getStoredToken().then((token) => {
                if (!token) {
                    // No token available — open the treasury page so the admin can act manually
                    return self.clients.openWindow(url)
                }
                return fetch(`/api/v1/club/payment-requests/${rid}/${action}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                }).then(() => {
                    // Refresh the treasury page if it's open
                    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                        .then((clients) => {
                            for (const c of clients) {
                                if ('navigate' in c) {
                                    ;(c as WindowClient).navigate(url)
                                    return (c as WindowClient).focus()
                                }
                            }
                        })
                })
            })
        )
        return
    }

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
