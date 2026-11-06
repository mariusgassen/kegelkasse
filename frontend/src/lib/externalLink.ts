/**
 * Links to pages served by our own origin (the user docs at /docs, the API docs at /api/docs) sit inside the
 * PWA's manifest scope (`/`). In an installed standalone app, `target="_blank"` is not enough to leave the
 * app for such a URL: iOS keeps in-scope navigations in the standalone window, and an Android WebAPK
 * claims every in-scope URL, so the page opens inside the app without its navigation.
 *
 * `externalHref` rewrites an in-scope link into a URL that the OS hands to the real browser:
 * - iOS: the `x-safari-https://` scheme (iOS 17+) opens Safari.
 * - Android: an `intent://` URL with an explicit browser package. Without the package Android would
 *   resolve the https URL back to the WebAPK itself. Samsung Internet and Firefox get their own package.
 * Outside a standalone app (browser tab, desktop) the plain URL plus `target="_blank"` already opens a new tab.
 */
export interface LinkEnv {
    userAgent: string
    standalone: boolean
    origin: string
}

function androidBrowserPackage(ua: string): string {
    if (/SamsungBrowser/i.test(ua)) return 'com.sec.android.app.sbrowser'
    if (/Firefox/i.test(ua)) return 'org.mozilla.firefox'
    return 'com.android.chrome'
}

export function externalHref(path: string, env: LinkEnv): string {
    const absolute = new URL(path, env.origin)
    if (!env.standalone) return absolute.href
    const ua = env.userAgent
    if (/iPad|iPhone|iPod/.test(ua)) return `x-safari-${absolute.href}`
    if (/Android/i.test(ua)) {
        const scheme = absolute.protocol.replace(':', '')
        const target = `${absolute.host}${absolute.pathname}${absolute.search}`
        return `intent://${target}#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
            `category=android.intent.category.BROWSABLE;package=${androidBrowserPackage(ua)};` +
            `S.browser_fallback_url=${encodeURIComponent(absolute.href)};end`
    }
    return absolute.href
}

/** `externalHref` for the current page. */
export function currentExternalHref(path: string, standalone: boolean): string {
    return externalHref(path, {
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        standalone,
        origin: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
    })
}
