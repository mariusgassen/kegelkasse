import {describe, expect, it} from 'vitest'
import {externalHref} from '../externalLink'

const origin = 'https://kasse.example.de'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
const ANDROID_SAMSUNG = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36'
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'

describe('externalHref', () => {
    it('returns the plain absolute URL outside a standalone app', () => {
        expect(externalHref('/docs/index.html', {userAgent: IPHONE, standalone: false, origin}))
            .toBe('https://kasse.example.de/docs/index.html')
    })

    it('hands the link to Safari in a standalone iOS app', () => {
        expect(externalHref('/api/docs', {userAgent: IPHONE, standalone: true, origin}))
            .toBe('x-safari-https://kasse.example.de/api/docs')
    })

    it('uses an intent URL with the Chrome package in a standalone Android app', () => {
        const href = externalHref('/docs/index.html', {userAgent: ANDROID_CHROME, standalone: true, origin})
        expect(href).toMatch(/^intent:\/\/kasse\.example\.de\/docs\/index\.html#Intent;scheme=https;/)
        expect(href).toContain('package=com.android.chrome;')
        expect(href).toContain(`S.browser_fallback_url=${encodeURIComponent('https://kasse.example.de/docs/index.html')};end`)
    })

    it('targets the browser the app was installed from on Android', () => {
        expect(externalHref('/api/docs', {userAgent: ANDROID_SAMSUNG, standalone: true, origin}))
            .toContain('package=com.sec.android.app.sbrowser;')
        expect(externalHref('/api/docs', {userAgent: ANDROID_FIREFOX, standalone: true, origin}))
            .toContain('package=org.mozilla.firefox;')
    })

    it('keeps the plain URL for a standalone desktop app', () => {
        expect(externalHref('/api/docs', {userAgent: DESKTOP, standalone: true, origin}))
            .toBe('https://kasse.example.de/api/docs')
    })
})
