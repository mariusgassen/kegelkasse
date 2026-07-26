import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {DURATION, EASING, prefersReducedMotion, flourishEnabled} from '@/lib/motion'
import {useEffectsStore} from '@/store/effects'

function stubMatchMedia(reduced: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? reduced : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }))
}

describe('motion tokens', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('orders durations from fast to ambient', () => {
        expect(DURATION.fast).toBeLessThan(DURATION.base)
        expect(DURATION.base).toBeLessThan(DURATION.slow)
        expect(DURATION.slow).toBeLessThan(DURATION.ambient)
    })

    /**
     * The CSS custom properties and the JS constants are two halves of one vocabulary; if they
     * drift, a JS-driven animation and its CSS neighbour stop moving together and nobody notices.
     */
    it('matches the --motion-* / --ease-* custom properties in index.css', () => {
        const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')
        const prop = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()

        expect(prop('motion-fast')).toBe(`${DURATION.fast}ms`)
        expect(prop('motion-base')).toBe(`${DURATION.base}ms`)
        expect(prop('motion-slow')).toBe(`${DURATION.slow}ms`)
        expect(prop('motion-ambient')).toBe(`${DURATION.ambient}ms`)
        expect(prop('ease-standard')).toBe(EASING.standard)
        expect(prop('ease-exit')).toBe(EASING.exit)
        expect(prop('ease-spring')).toBe(EASING.spring)
    })

    it('reads the OS reduced-motion preference', () => {
        stubMatchMedia(true)
        expect(prefersReducedMotion()).toBe(true)
        stubMatchMedia(false)
        expect(prefersReducedMotion()).toBe(false)
    })

    it('treats a missing matchMedia as "animation is fine"', () => {
        vi.stubGlobal('matchMedia', undefined)
        expect(prefersReducedMotion()).toBe(false)
    })
})

describe('flourishEnabled', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
        stubMatchMedia(false)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('is on when motion is welcome and the effects switch is on', () => {
        expect(flourishEnabled()).toBe(true)
    })

    it('is off when the OS asks for reduced motion', () => {
        stubMatchMedia(true)
        expect(flourishEnabled()).toBe(false)
    })

    it('is off when the member turned the effects switch off', () => {
        useEffectsStore.setState({effectsEnabled: false})
        expect(flourishEnabled()).toBe(false)
    })
})
