import {useSyncExternalStore} from 'react'
import {router} from '@/router'

/**
 * Scroll a deep-link target element into view and briefly flash it (#64).
 *
 * The shared DOM half of the deep-link "navigate-and-highlight" pattern: after a short delay
 * (so the target has rendered), scroll it into the centre of the viewport and add the
 * `kce-deeplink-flash` class for `duration` ms. Consolidates the copies previously inlined in
 * CommitteePage, SchedulePage, EveningHubPage and CommentThread.
 *
 * Returns a cleanup that cancels the pending timers — call it from a `useEffect` cleanup so a
 * fast re-navigation or unmount doesn't leave a dangling flash.
 */
export function flashDeepLinkTarget(
    elementId: string,
    {delay = 120, duration = 2500}: {delay?: number; duration?: number} = {},
): () => void {
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(
        setTimeout(() => {
            const el = document.getElementById(elementId)
            el?.scrollIntoView({behavior: 'smooth', block: 'center'})
            el?.classList.add('kce-deeplink-flash')
            timers.push(setTimeout(() => el?.classList.remove('kce-deeplink-flash'), duration))
        }, delay),
    )
    return () => timers.forEach(clearTimeout)
}

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
