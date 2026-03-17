import {useEffect, useState} from 'react'

/**
 * Page state hook backed by URL hash.
 * navPages: only these are reflected in the URL hash (ephemeral pages like 'config' are not).
 * Hash format: #mainPage  or  #mainPage:subTab
 */
export function usePage<T extends string>(initial: T, navPages?: T[]): [T, (p: T) => void] {
    const getFromHash = (): T => {
        const hash = window.location.hash.slice(1).split(':')[0] as T
        if (!hash) return initial
        if (navPages && !navPages.includes(hash)) return initial
        return hash
    }

    const [page, setPageState] = useState<T>(getFromHash)

    const setPage = (p: T) => {
        if (!navPages || navPages.includes(p)) {
            window.location.hash = p
        }
        setPageState(p)
    }

    useEffect(() => {
        const handler = () => setPageState(getFromHash())
        window.addEventListener('hashchange', handler)
        return () => window.removeEventListener('hashchange', handler)
    }, [])

    return [page, setPage]
}

/**
 * Sub-tab state hook backed by URL hash sub-key.
 * Hash format: #mainPage:subTab
 * Preserves the main page part when updating the sub-tab.
 */
export function useHashTab<T extends string>(initial: T, valid: T[]): [T, (t: T) => void] {
    const getFromHash = (): T => {
        const parts = window.location.hash.slice(1).split(':')
        const sub = (parts[1] ?? '').split('?')[0] as T  // strip ?params before matching
        if (!sub || !valid.includes(sub)) return initial
        return sub
    }

    const [tab, setTabState] = useState<T>(getFromHash)

    const setTab = (t: T) => {
        const mainPage = window.location.hash.slice(1).split(':')[0]
        if (mainPage) {
            window.location.hash = `${mainPage}:${t}`
        }
        setTabState(t)
    }

    useEffect(() => {
        const handler = () => setTabState(getFromHash())
        window.addEventListener('hashchange', handler)
        return () => window.removeEventListener('hashchange', handler)
    }, [])

    return [tab, setTab]
}

/** Call after successful auth to remove ?token / ?reset query params from URL */
export function clearAuthParams() {
    if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
}
