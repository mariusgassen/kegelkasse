import {useEffect, useState} from 'react'
import {registerSW} from 'virtual:pwa-register'

/**
 * Registers the service worker once and exposes update state for the `UpdatePrompt` banner.
 * `registerType: 'prompt'` + the custom `sw.ts` SKIP_WAITING handler mean a new SW version
 * waits for explicit confirmation instead of silently reloading the app mid-evening.
 *
 * The browser only checks for a new worker on navigation, which an installed PWA that stays
 * open (or is resumed from the background, as on iOS) rarely does. So we also check hourly
 * and whenever the app returns to the foreground / comes back online. If the new version is
 * found right after launch (before the member could have entered anything) it is applied
 * immediately; later it waits behind the banner.
 */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
export const AUTO_APPLY_WINDOW_MS = 10 * 1000

export function useSwUpdate() {
    const [needRefresh, setNeedRefresh] = useState(false)
    const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return
        const startedAt = Date.now()
        let registration: ServiceWorkerRegistration | undefined
        let update: ((reload?: boolean) => Promise<void>) | undefined
        const check = () => {
            if (navigator.onLine === false) return
            registration?.update().catch(() => undefined)
        }
        const onVisible = () => {
            if (document.visibilityState === 'visible') check()
        }
        update = registerSW({
            immediate: true,
            onRegisteredSW(_url, reg) {
                registration = reg
            },
            onNeedRefresh() {
                if (Date.now() - startedAt < AUTO_APPLY_WINDOW_MS && update) void update(true)
                else setNeedRefresh(true)
            },
        })
        setUpdateSW(() => update!)
        const timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS)
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('online', check)
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('online', check)
        }
    }, [])

    async function applyUpdate() {
        await updateSW?.(true)
    }

    return {needRefresh, applyUpdate, dismiss: () => setNeedRefresh(false)}
}
