import {useEffect, useState} from 'react'

/**
 * Page state hook backed by URL hash.
 * navPages: only these are reflected in the URL hash (ephemeral pages like 'config' are not).
 */
export function usePage<T extends string>(initial: T, navPages?: T[]): [T, (p: T) => void] {
    const getFromHash = (): T => {
        const hash = window.location.hash.slice(1) as T
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

/** Call after successful auth to remove ?token / ?reset query params from URL */
export function clearAuthParams() {
    if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
}
