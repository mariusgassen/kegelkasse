/**
 * Legacy hash-URL → path/search translation.
 *
 * Before the TanStack Router migration (#64) the whole app was driven by homegrown hash
 * protocols: `#<page>[:<subtab>][?<query>]`, e.g. `#treasury:accounts?member=5`,
 * `#committee:trips?item=5`, `#evening:manage`, `#schedule?evening=5`.
 *
 * Those URLs are still in the wild — push-notification deep links stored server-side
 * (`notification_log.url`), e-mail links, bookmarks — so they must keep resolving. This
 * pure translator maps a legacy hash to the new path-based location. The sub-tab (`:x`)
 * becomes a `tab` search param; any `?query` params are carried through verbatim.
 *
 * Returns `null` for anything that isn't a recognised top-level page, so callers can fall
 * back to their previous behaviour.
 */

/** Top-level pages that own a route. Keep in sync with the router route tree. */
export const ROUTE_PAGES = [
    'home',
    'evening',
    'treasury',
    'schedule',
    'committee',
    'stats',
    'club',
    'members',
] as const

export type RoutePage = (typeof ROUTE_PAGES)[number]

export interface LegacyLocation {
    /** Leading-slash path, e.g. `/treasury`. */
    pathname: string
    /** Flat search params (all string-valued), e.g. `{tab: 'accounts', member: '5'}`. */
    search: Record<string, string>
}

function isRoutePage(s: string): s is RoutePage {
    return (ROUTE_PAGES as readonly string[]).includes(s)
}

/**
 * Translate a legacy hash fragment (with or without the leading `#`) to a `{pathname, search}`
 * location. Returns `null` when the hash does not name a known page.
 */
export function legacyHashToLocation(hashInput: string): LegacyLocation | null {
    if (!hashInput) return null
    // Normalise: strip a leading '#', and a leading '/' (some links use `#/treasury`).
    let hash = hashInput.startsWith('#') ? hashInput.slice(1) : hashInput
    if (hash.startsWith('/')) hash = hash.slice(1)
    if (!hash) return null

    // Split off the query portion.
    const qIndex = hash.indexOf('?')
    const beforeQuery = qIndex >= 0 ? hash.slice(0, qIndex) : hash
    const queryStr = qIndex >= 0 ? hash.slice(qIndex + 1) : ''

    // `<page>` or `<page>:<subtab>`
    const [page, subTab] = beforeQuery.split(':')
    if (!isRoutePage(page)) return null

    const search: Record<string, string> = {}
    if (subTab) search.tab = subTab
    for (const [k, v] of new URLSearchParams(queryStr)) {
        // A real `?tab=` in the query wins over the `:subtab` shorthand (they never co-occur today).
        search[k] = v
    }

    return {pathname: `/${page}`, search}
}

/** Serialise a `{pathname, search}` location to a path string like `/treasury?tab=accounts&member=5`. */
export function locationToPath({pathname, search}: LegacyLocation): string {
    const qs = new URLSearchParams(search).toString()
    return qs ? `${pathname}?${qs}` : pathname
}
