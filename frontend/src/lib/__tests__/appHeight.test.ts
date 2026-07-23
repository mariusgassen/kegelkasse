import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {applyAppHeight, installAppHeight, measureAppHeight} from '../appHeight'

describe('appHeight', () => {
    beforeEach(() => {
        document.documentElement.style.removeProperty('--app-height')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('measures window.innerHeight', () => {
        vi.stubGlobal('innerHeight', 812)
        expect(measureAppHeight()).toBe(812)
    })

    it('publishes --app-height in px from innerHeight', () => {
        vi.stubGlobal('innerHeight', 640)
        applyAppHeight()
        expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('640px')
    })

    it('applies immediately on install and updates on resize', () => {
        vi.stubGlobal('innerHeight', 500)
        const cleanup = installAppHeight()
        expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('500px')

        vi.stubGlobal('innerHeight', 700)
        window.dispatchEvent(new Event('resize'))
        expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('700px')

        cleanup()
    })

    it('re-measures after orientationchange (incl. deferred re-apply)', () => {
        vi.useFakeTimers()
        vi.stubGlobal('innerHeight', 400)
        const cleanup = installAppHeight()

        // iOS may report the pre-rotation height synchronously, then settle shortly after.
        vi.stubGlobal('innerHeight', 900)
        window.dispatchEvent(new Event('orientationchange'))
        expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('900px')

        vi.stubGlobal('innerHeight', 844)
        vi.advanceTimersByTime(300)
        expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('844px')

        cleanup()
        vi.useRealTimers()
    })

    it('stops updating after cleanup', () => {
        vi.stubGlobal('innerHeight', 480)
        const cleanup = installAppHeight()
        cleanup()

        vi.stubGlobal('innerHeight', 999)
        window.dispatchEvent(new Event('resize'))
        expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('480px')
    })
})
