import {useEffect, useState} from 'react'

/**
 * The `beforeinstallprompt` event isn't in the TS DOM lib. Minimal local typing.
 * Fired by Chromium browsers when the PWA install criteria are met.
 */
interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[]
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
    prompt(): Promise<void>
}

/** Fired on `window` whenever the captured install event becomes available or is consumed. */
export const INSTALL_AVAILABLE_EVENT = 'kegelkasse:install-available'

// The event can fire before React mounts, so capture it at module import time and stash it.
let deferredPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault()
        deferredPrompt = e as BeforeInstallPromptEvent
        window.dispatchEvent(new Event(INSTALL_AVAILABLE_EVENT))
    })
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null
        window.dispatchEvent(new Event(INSTALL_AVAILABLE_EVENT))
    })
}

function detectIos(): boolean {
    return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function detectStandalone(): boolean {
    if (typeof window === 'undefined') return false
    const standaloneByMedia = typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches
    return standaloneByMedia ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export interface PwaInstall {
    /** A `beforeinstallprompt` event was captured — the native install prompt can be shown. */
    canInstall: boolean
    /** Running on iOS (Safari has no `beforeinstallprompt`; users add via the Share menu). */
    isIos: boolean
    /** The app is already running as an installed standalone PWA. */
    isStandalone: boolean
    /** Triggers the native install prompt (Chromium only) and resolves with the user's choice. */
    promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

/**
 * Single source of truth for PWA install state, shared by the install banner and the profile sheet.
 */
export function usePwaInstall(): PwaInstall {
    const [canInstall, setCanInstall] = useState(deferredPrompt !== null)
    const [isStandalone, setIsStandalone] = useState(detectStandalone)
    const isIos = detectIos()

    useEffect(() => {
        const onAvailable = () => setCanInstall(deferredPrompt !== null)
        const onDisplayChange = () => setIsStandalone(detectStandalone())
        const mql = typeof window.matchMedia === 'function'
            ? window.matchMedia('(display-mode: standalone)')
            : null

        window.addEventListener(INSTALL_AVAILABLE_EVENT, onAvailable)
        mql?.addEventListener('change', onDisplayChange)
        return () => {
            window.removeEventListener(INSTALL_AVAILABLE_EVENT, onAvailable)
            mql?.removeEventListener('change', onDisplayChange)
        }
    }, [])

    async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
        if (!deferredPrompt) return 'unavailable'
        const evt = deferredPrompt
        await evt.prompt()
        const {outcome} = await evt.userChoice
        deferredPrompt = null
        window.dispatchEvent(new Event(INSTALL_AVAILABLE_EVENT))
        return outcome
    }

    return {canInstall, isIos, isStandalone, promptInstall}
}
