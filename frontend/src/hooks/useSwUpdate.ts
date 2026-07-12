import {useEffect, useState} from 'react'
import {registerSW} from 'virtual:pwa-register'

/**
 * Registers the service worker once and exposes update state for the `UpdatePrompt` banner.
 * `registerType: 'prompt'` + the custom `sw.ts` SKIP_WAITING handler mean a new SW version
 * waits for explicit confirmation instead of silently reloading the app mid-evening.
 */
export function useSwUpdate() {
    const [needRefresh, setNeedRefresh] = useState(false)
    const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return
        const update = registerSW({
            immediate: true,
            onNeedRefresh() {
                setNeedRefresh(true)
            },
        })
        setUpdateSW(() => update)
    }, [])

    async function applyUpdate() {
        await updateSW?.(true)
    }

    return {needRefresh, applyUpdate, dismiss: () => setNeedRefresh(false)}
}
