import {useSyncExternalStore} from 'react'
import {router} from '@/router'

/**
 * Shared deep-link reactivity primitive (#64).
 *
 * Deep-link params (`?member=`, `?item=`, `?evening=`, …) now live in the router search
 * instead of the URL hash. Pages that consume a deep link used to bump a local counter on
 * `hashchange`; this hook replaces those ~5 duplicated listeners with a single value that
 * changes whenever the router location changes — so a deep link tapped while already on the
 * target page (e.g. from a push notification) still re-triggers the page's consume effect.
 *
 * Returns the raw search string, a stable primitive suitable as a `useEffect` dependency.
 */
export function useDeepLinkVersion(): string {
    return useSyncExternalStore(
        (cb) => router.subscribe('onResolved', cb),
        () => router.state.location.searchStr,
        () => router.state.location.searchStr,
    )
}
