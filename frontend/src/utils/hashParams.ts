import {router} from '@/router'

/**
 * Deep-link parameter helpers, backed by the TanStack Router singleton (#64).
 *
 * Deep-link params (`member`, `event`, `evening`, `item`, `q`, `rid`, `player`, `memberName`)
 * now live in the router search rather than a `#page?query` hash. These keep their previous
 * signatures so the page effects that consume deep links stay unchanged.
 */

function currentSearch(): Record<string, unknown> {
    return (router.state.location.search as Record<string, unknown>) ?? {}
}

/** Current deep-link params as a URLSearchParams (so callers can `.get('member')` etc.). */
export function getHashParams(): URLSearchParams {
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(currentSearch())) {
        if (v != null) flat[k] = String(v)
    }
    return new URLSearchParams(flat)
}

/** Drop consumed deep-link params from the URL (keeping the active `tab`), without a reload. */
export function clearHashParams() {
    router
        .navigate({
            to: router.state.location.pathname,
            search: (prev: Record<string, unknown>) => {
                const tab = prev?.tab
                return tab != null ? {tab} : {}
            },
            replace: true,
        })
        .catch(() => {})
}
