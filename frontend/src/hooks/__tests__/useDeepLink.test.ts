import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// flashDeepLinkTarget is pure DOM + timers and does not touch the router, but useDeepLink.ts
// imports the router singleton — stub it so importing the module doesn't pull in the real tree.
vi.mock('@/router', () => ({ router: { state: { location: { searchStr: '' } }, subscribe: () => () => {} } }))

import { flashDeepLinkTarget } from '../useDeepLink'

describe('flashDeepLinkTarget', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        document.body.innerHTML = '<div id="target">hi</div>'
        // jsdom has no scrollIntoView
        Element.prototype.scrollIntoView = vi.fn()
    })
    afterEach(() => {
        vi.useRealTimers()
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('scrolls to and flashes the element after the delay, then removes the class', () => {
        flashDeepLinkTarget('target')
        const el = document.getElementById('target')!
        expect(el.classList.contains('kce-deeplink-flash')).toBe(false)

        vi.advanceTimersByTime(120)
        expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
        expect(el.classList.contains('kce-deeplink-flash')).toBe(true)

        vi.advanceTimersByTime(2500)
        expect(el.classList.contains('kce-deeplink-flash')).toBe(false)
    })

    it('honours custom delay and duration', () => {
        flashDeepLinkTarget('target', { delay: 100, duration: 2000 })
        const el = document.getElementById('target')!
        vi.advanceTimersByTime(99)
        expect(el.classList.contains('kce-deeplink-flash')).toBe(false)
        vi.advanceTimersByTime(1)
        expect(el.classList.contains('kce-deeplink-flash')).toBe(true)
        vi.advanceTimersByTime(2000)
        expect(el.classList.contains('kce-deeplink-flash')).toBe(false)
    })

    it('cleanup cancels the pending flash', () => {
        const cleanup = flashDeepLinkTarget('target')
        cleanup()
        vi.advanceTimersByTime(5000)
        const el = document.getElementById('target')!
        expect(el.scrollIntoView).not.toHaveBeenCalled()
        expect(el.classList.contains('kce-deeplink-flash')).toBe(false)
    })

    it('does nothing when the element is missing', () => {
        expect(() => {
            flashDeepLinkTarget('missing')
            vi.advanceTimersByTime(3000)
        }).not.toThrow()
    })
})
