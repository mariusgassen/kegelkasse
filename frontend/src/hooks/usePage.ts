import {useSyncExternalStore} from 'react'
import {router} from '@/router'
import {ROUTE_PAGES} from '@/lib/legacyHash'

/**
 * Routing hooks, backed by the TanStack Router singleton (#64).
 *
 * These keep the exact signatures the pages already call — `usePage(initial, navPages)` and
 * `useHashTab(initial, valid)` — but the page and sub-tab now live in the router's path and
 * `?tab=` search param instead of a homegrown `#page:subtab` hash protocol. Because they talk
 * to the `router` singleton (not router context) they also work when a page is rendered bare
 * in a component test.
 */

/** Subscribe a component to router location changes; returns the current location. */
function useRouterLocation() {
    return useSyncExternalStore(
        (cb) => router.subscribe('onResolved', cb),
        () => router.state.location,
        () => router.state.location,
    )
}

/** Current top-level page derived from the pathname (`/treasury` → `treasury`). */
function pageFromPathname(pathname: string): string {
    return pathname.replace(/^\//, '').split('/')[0]
}

/**
 * Top-level page state, backed by the router pathname.
 * `navPages`: only these are navigable; anything else falls back to `initial`.
 */
export function usePage<T extends string>(initial: T, navPages?: T[]): [T, (p: T) => void] {
    const location = useRouterLocation()
    const raw = pageFromPathname(location.pathname) as T
    const page: T = raw && (!navPages || navPages.includes(raw)) ? raw : initial

    const setPage = (p: T) => {
        if (navPages && !navPages.includes(p)) return
        router.navigate({to: `/${p}`}).catch(() => {})
    }

    return [page, setPage]
}

/**
 * Sub-tab state, backed by the router `?tab=` search param.
 * Preserves the current page and any other search params when updating the sub-tab.
 */
export function useHashTab<T extends string>(initial: T, valid: T[]): [T, (t: T) => void] {
    const location = useRouterLocation()
    const current = (location.search as Record<string, unknown>).tab
    const tab: T = typeof current === 'string' && valid.includes(current as T) ? (current as T) : initial

    const setTab = (t: T) => {
        // Generic adapter navigates to a runtime pathname, so the per-route typed search can't
        // apply — cast past it (typed navigation lives at the literal call sites instead).
        router.navigate({
            to: location.pathname,
            search: (prev: Record<string, unknown>) => ({...prev, tab: t}),
        } as never).catch(() => {})
    }

    return [tab, setTab]
}

/** Call after successful auth to remove `?token` / `?reset` query params from the URL. */
export function clearAuthParams() {
    const {search, pathname, hash} = window.location
    const params = new URLSearchParams(search)
    if (params.has('token') || params.has('reset')) {
        params.delete('token')
        params.delete('reset')
        const qs = params.toString()
        window.history.replaceState({}, '', pathname + (qs ? `?${qs}` : '') + (hash || ''))
    }
}

export {ROUTE_PAGES}
