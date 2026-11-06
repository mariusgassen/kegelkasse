/**
 * Club-branded install icon (#102).
 *
 * Browsers read the icon from the document at the moment someone installs the app: Chrome and
 * Firefox on Android from `<link rel="manifest">`, iOS from `<link rel="apple-touch-icon">`. So
 * swapping those two links (plus the PNG favicon) is all it takes — the server renders the PNGs.
 *
 * The last applied links are kept in localStorage and restored before the first render, so the
 * login screen and a cold start already point at the club's icon instead of flashing the default.
 */
import type {AppIconLinks} from '@/types'

const STORAGE_KEY = 'kegelkasse-app-icon'

export const DEFAULT_LINKS = {
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/icons/apple-touch-icon.png',
    icon: '/icons/icon-192.png',
} as const

export interface HeadIconLinks {
    manifest: string
    appleTouchIcon: string
    icon: string
}

/** The links to put in the head for a club's setting — the stock ones unless it is switched on. */
export function resolveIconLinks(cfg: AppIconLinks | null | undefined): HeadIconLinks {
    if (!cfg?.enabled || !cfg.manifest_url || !cfg.apple_touch_icon_url || !cfg.icon_url) return {...DEFAULT_LINKS}
    return {manifest: cfg.manifest_url, appleTouchIcon: cfg.apple_touch_icon_url, icon: cfg.icon_url}
}

function setLink(selector: string, rel: string, href: string, attrs: Record<string, string> = {}, create = true) {
    let el = document.head.querySelector<HTMLLinkElement>(selector)
    if (!el) {
        if (!create) return
        el = document.createElement('link')
        el.rel = rel
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
        document.head.appendChild(el)
    }
    if (el.getAttribute('href') !== href) el.setAttribute('href', href)
}

export function writeIconLinks(links: HeadIconLinks) {
    // The stock manifest link is injected by the PWA build only — in dev there is none, and
    // creating one pointing at a missing file would just 404.
    const isDefault = links.manifest === DEFAULT_LINKS.manifest
    setLink('link[rel="manifest"]', 'manifest', links.manifest, {}, !isDefault)
    setLink('link[rel="apple-touch-icon"]', 'apple-touch-icon', links.appleTouchIcon)
    setLink('link[rel="icon"][type="image/png"]', 'icon', links.icon, {type: 'image/png', sizes: '192x192'})
}

/** Point the document at the club's icon (or back at the stock one) and remember it. */
export function applyAppIcon(cfg: AppIconLinks | null | undefined) {
    const links = resolveIconLinks(cfg)
    writeIconLinks(links)
    try {
        if (links.manifest === DEFAULT_LINKS.manifest) localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
    } catch {
        // storage unavailable (private mode) — the links still apply for this session
    }
}

/** Re-apply the last known club icon before the app has loaded the club. */
export function restoreAppIcon() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const links = JSON.parse(raw) as Partial<HeadIconLinks>
        if (typeof links.manifest === 'string' && typeof links.appleTouchIcon === 'string' && typeof links.icon === 'string') {
            writeIconLinks(links as HeadIconLinks)
        }
    } catch {
        // corrupt entry — keep the stock links
    }
}
