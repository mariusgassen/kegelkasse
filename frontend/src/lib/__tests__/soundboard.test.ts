import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

class FakeAudioParam {
    setValueAtTime = vi.fn()
    linearRampToValueAtTime = vi.fn()
    exponentialRampToValueAtTime = vi.fn()
}

class FakeOscillator {
    type = ''
    frequency = new FakeAudioParam()
    connect = vi.fn()
    start = vi.fn()
    stop = vi.fn()
}

class FakeGainNode {
    gain = new FakeAudioParam()
    connect = vi.fn()
}

class FakeBiquadFilter {
    type = ''
    frequency = {value: 0}
    connect = vi.fn()
}

class FakeBufferSource {
    buffer: unknown = null
    connect = vi.fn()
    start = vi.fn()
    stop = vi.fn()
}

class FakeAudioBuffer {
    constructor(public channels: number, public length: number, public sampleRate: number) {}
    getChannelData() {
        return new Float32Array(this.length)
    }
}

let initialState: 'running' | 'suspended' = 'running'

class FakeAudioContext {
    state: 'running' | 'suspended' = initialState
    currentTime = 0
    sampleRate = 44100
    destination = {}
    createOscillator() {
        return new FakeOscillator()
    }
    createGain() {
        return new FakeGainNode()
    }
    createBiquadFilter() {
        return new FakeBiquadFilter()
    }
    createBufferSource() {
        return new FakeBufferSource()
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
        return new FakeAudioBuffer(channels, length, sampleRate)
    }
    resume() {
        return Promise.resolve()
    }
}

async function loadSoundboard() {
    vi.resetModules()
    const {useEffectsStore} = await import('../../store/effects')
    const soundboard = await import('../soundboard')
    return {...soundboard, useEffectsStore}
}

describe('soundboard', () => {
    beforeEach(() => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    describe('isSoundPresetKey', () => {
        it('accepts every catalog key', async () => {
            const {SOUND_PRESETS, isSoundPresetKey} = await loadSoundboard()
            for (const p of SOUND_PRESETS) expect(isSoundPresetKey(p.key)).toBe(true)
        })

        it('rejects unknown, null and undefined values', async () => {
            const {isSoundPresetKey} = await loadSoundboard()
            expect(isSoundPresetKey('not-a-preset')).toBe(false)
            expect(isSoundPresetKey(null)).toBe(false)
            expect(isSoundPresetKey(undefined)).toBe(false)
            expect(isSoundPresetKey('')).toBe(false)
        })
    })

    describe('playSound', () => {
        it('does nothing for a null/unknown key', async () => {
            const {playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(true)
            const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

            playSound(null)
            playSound('not-a-preset')

            expect(createOscillatorSpy).not.toHaveBeenCalled()
        })

        it('does nothing when effects are disabled', async () => {
            const {playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(false)
            const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

            playSound('buzzer')

            expect(createOscillatorSpy).not.toHaveBeenCalled()
        })

        it('synthesizes every preset when effects are enabled', async () => {
            const {SOUND_PRESETS, playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(true)
            const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')
            const createBufferSourceSpy = vi.spyOn(FakeAudioContext.prototype, 'createBufferSource')

            for (const p of SOUND_PRESETS) playSound(p.key)

            // Every preset plays at least one oscillator or noise burst.
            expect(createOscillatorSpy.mock.calls.length + createBufferSourceSpy.mock.calls.length)
                .toBeGreaterThanOrEqual(SOUND_PRESETS.length)
        })

        it('resumes a suspended context before playing', async () => {
            initialState = 'suspended'
            const {playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(true)
            const resumeSpy = vi.spyOn(FakeAudioContext.prototype, 'resume')

            playSound('bell')

            expect(resumeSpy).toHaveBeenCalled()
            initialState = 'running'
        })
    })

    describe('previewSound', () => {
        it('plays regardless of the effects switch', async () => {
            const {previewSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(false)
            const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

            previewSound('laser')

            expect(createOscillatorSpy).toHaveBeenCalled()
        })
    })
})
