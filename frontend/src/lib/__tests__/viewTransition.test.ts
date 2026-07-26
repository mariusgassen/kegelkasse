import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {startViewTransition, morphFrom, supportsViewTransitions, MORPH_NAME} from '@/lib/viewTransition'
import {useEffectsStore} from '@/store/effects'

interface FakeTransition {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
}

/** Stand-in for the browser API, which jsdom does not implement. */
function installFakeApi(): { calls: number } {
    const state = {calls: 0}
    Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        writable: true,
        value: (cb: () => void): FakeTransition => {
            state.calls++
            cb()
            return {
                finished: Promise.resolve(),
                ready: Promise.resolve(),
                updateCallbackDone: Promise.resolve(),
            }
        },
    })
    return state
}

function removeFakeApi() {
    Reflect.deleteProperty(document, 'startViewTransition')
}

describe('viewTransition', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
        vi.stubGlobal('matchMedia', (q: string) => ({matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn()}))
    })
    afterEach(() => {
        removeFakeApi()
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('reports no support when the browser lacks the API', () => {
        expect(supportsViewTransitions()).toBe(false)
    })

    it('reports support once the API exists', () => {
        installFakeApi()
        expect(supportsViewTransitions()).toBe(true)
    })

    it('still runs the update when the API is missing', async () => {
        const update = vi.fn()
        await startViewTransition(update)
        expect(update).toHaveBeenCalledTimes(1)
    })

    it('routes the update through the API when it exists', async () => {
        const api = installFakeApi()
        const update = vi.fn()
        await startViewTransition(update)
        expect(api.calls).toBe(1)
        expect(update).toHaveBeenCalledTimes(1)
    })

    it('skips the API — but never the update — when motion is switched off', async () => {
        const api = installFakeApi()
        useEffectsStore.setState({effectsEnabled: false})
        const update = vi.fn()
        await startViewTransition(update)
        expect(api.calls).toBe(0)
        expect(update).toHaveBeenCalledTimes(1)
    })
})

describe('morphFrom', () => {
    let el: HTMLElement

    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
        vi.stubGlobal('matchMedia', (q: string) => ({matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn()}))
        el = document.createElement('div')
        document.body.appendChild(el)
    })
    afterEach(() => {
        el.remove()
        removeFakeApi()
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('tags the origin element while the transition runs and clears it afterwards', async () => {
        installFakeApi()
        let nameDuringUpdate = ''
        await morphFrom(el, () => {
            nameDuringUpdate = el.style.viewTransitionName
        })
        expect(nameDuringUpdate).toBe(MORPH_NAME)
        expect(el.style.viewTransitionName).toBe('')
    })

    it('never tags the element when the API is unavailable', async () => {
        const update = vi.fn()
        await morphFrom(el, update)
        expect(update).toHaveBeenCalledTimes(1)
        expect(el.style.viewTransitionName).toBe('')
    })

    it('runs the update with no origin element', async () => {
        installFakeApi()
        const update = vi.fn()
        await morphFrom(null, update)
        expect(update).toHaveBeenCalledTimes(1)
    })
})
