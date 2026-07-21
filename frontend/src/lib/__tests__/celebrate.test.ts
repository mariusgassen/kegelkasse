import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@/components/ui/Toast', () => ({
    showToast: vi.fn(),
}))

class FakeAudioParam {
    setValueAtTime = vi.fn()
    linearRampToValueAtTime = vi.fn()
    exponentialRampToValueAtTime = vi.fn()
}

class FakeOscillator {
    type = ''
    frequency = {value: 0}
    connect = vi.fn()
    start = vi.fn()
    stop = vi.fn()
}

class FakeGainNode {
    gain = new FakeAudioParam()
    connect = vi.fn()
}

class FakeAudioContext {
    state: 'running' | 'suspended' = 'running'
    currentTime = 0
    destination = {}
    createOscillator() {
        return new FakeOscillator()
    }
    createGain() {
        return new FakeGainNode()
    }
    resume() {
        return Promise.resolve()
    }
}

const fakeCtx2d = {
    clearRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
}

function setMatchMedia(reducedMotion: boolean) {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })))
}

async function loadCelebrate() {
    vi.resetModules()
    const {useEffectsStore} = await import('../../store/effects')
    const {celebrate} = await import('../celebrate')
    return {celebrate, useEffectsStore}
}

describe('celebrate', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('AudioContext', FakeAudioContext)
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx2d as any)
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        setMatchMedia(false)
        document.querySelectorAll('canvas').forEach(c => c.remove())
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        document.querySelectorAll('canvas').forEach(c => c.remove())
    })

    it('does nothing when effects are disabled', async () => {
        const {celebrate, useEffectsStore} = await loadCelebrate()
        useEffectsStore.getState().setEffectsEnabled(false)
        const {showToast} = await import('@/components/ui/Toast')

        celebrate('king', '👑 König gekrönt!')

        expect(showToast).not.toHaveBeenCalled()
        expect(document.querySelectorAll('canvas').length).toBe(0)
    })

    it('shows a toast and plays a chime when effects are enabled', async () => {
        const {celebrate, useEffectsStore} = await loadCelebrate()
        useEffectsStore.getState().setEffectsEnabled(true)
        const {showToast} = await import('@/components/ui/Toast')

        celebrate('king', '👑 König gekrönt!')

        expect(showToast).toHaveBeenCalledWith('👑 König gekrönt!')
    })

    it('skips the confetti canvas when prefers-reduced-motion is set, but still chimes', async () => {
        setMatchMedia(true)
        const {celebrate, useEffectsStore} = await loadCelebrate()
        useEffectsStore.getState().setEffectsEnabled(true)
        const {showToast} = await import('@/components/ui/Toast')

        celebrate('allnine', '🎯 Alle Neune!')

        expect(showToast).toHaveBeenCalled()
        expect(document.querySelectorAll('canvas').length).toBe(0)
    })

    it('bursts confetti and removes the canvas after the animation window', async () => {
        const {celebrate, useEffectsStore} = await loadCelebrate()
        useEffectsStore.getState().setEffectsEnabled(true)

        celebrate('king', '👑 König gekrönt!')

        expect(document.querySelectorAll('canvas').length).toBe(1)

        await vi.advanceTimersByTimeAsync(2000)

        expect(document.querySelectorAll('canvas').length).toBe(0)
    })

    it('plays a 3-note chime for king', async () => {
        const {celebrate, useEffectsStore} = await loadCelebrate()
        useEffectsStore.getState().setEffectsEnabled(true)
        const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

        celebrate('king', '👑 König gekrönt!')

        expect(createOscillatorSpy).toHaveBeenCalledTimes(3)
    })

    it('plays an extra triumphant high note for allnine', async () => {
        const {celebrate, useEffectsStore} = await loadCelebrate()
        useEffectsStore.getState().setEffectsEnabled(true)
        const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

        celebrate('allnine', '🎯 Alle Neune!')

        expect(createOscillatorSpy).toHaveBeenCalledTimes(4)
    })
})
