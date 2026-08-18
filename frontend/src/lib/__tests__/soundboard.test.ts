import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

class FakeAudioParam {
    value = 0
    setValueAtTime = vi.fn()
    linearRampToValueAtTime = vi.fn()
    exponentialRampToValueAtTime = vi.fn()
}

class FakeNode {
    connect = vi.fn()
}

class FakeOscillator extends FakeNode {
    type = ''
    frequency = new FakeAudioParam()
    detune = new FakeAudioParam()
    start = vi.fn()
    stop = vi.fn()
}

class FakeGainNode extends FakeNode {
    gain = new FakeAudioParam()
}

class FakeBiquadFilter extends FakeNode {
    type = ''
    frequency = new FakeAudioParam()
    Q = new FakeAudioParam()
}

class FakeBufferSource extends FakeNode {
    buffer: unknown = null
    playbackRate = new FakeAudioParam()
    start = vi.fn()
    stop = vi.fn()
}

class FakeWaveShaper extends FakeNode {
    curve: Float32Array | null = null
    oversample = 'none'
}

class FakeConvolver extends FakeNode {
    buffer: unknown = null
}

class FakeCompressor extends FakeNode {
    threshold = new FakeAudioParam()
    knee = new FakeAudioParam()
    ratio = new FakeAudioParam()
    attack = new FakeAudioParam()
    release = new FakeAudioParam()
}

class FakeAudioBuffer {
    duration: number
    constructor(public channels: number, public length: number, public sampleRate: number) {
        this.duration = length / sampleRate
    }
    getChannelData() {
        return new Float32Array(this.length)
    }
}

let initialState: 'running' | 'suspended' = 'running'
/** Node types omitted from the fake, to exercise the feature-detection fallbacks. */
let omitted: string[] = []

class FakeAudioContext {
    state: 'running' | 'suspended' = initialState
    currentTime = 0
    sampleRate = 44100
    destination = new FakeNode()
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
    createWaveShaper() {
        return new FakeWaveShaper()
    }
    createConvolver() {
        return new FakeConvolver()
    }
    createDynamicsCompressor() {
        return new FakeCompressor()
    }
    resume() {
        return Promise.resolve()
    }
}

function contextClass() {
    if (omitted.length === 0) return FakeAudioContext
    class Trimmed extends FakeAudioContext {}
    for (const name of omitted) delete (Trimmed.prototype as any)[name]
    return Trimmed
}

async function loadSoundboard() {
    vi.resetModules()
    vi.stubGlobal('AudioContext', contextClass())
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
        omitted = []
        initialState = 'running'
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

        it('every preset has a unique key, an emoji and an i18n label key', async () => {
            const {SOUND_PRESETS} = await loadSoundboard()
            const keys = SOUND_PRESETS.map(p => p.key)
            expect(new Set(keys).size).toBe(keys.length)
            for (const p of SOUND_PRESETS) {
                expect(p.emoji.length).toBeGreaterThan(0)
                expect(p.labelKey).toBe(`sound.preset.${p.key}`)
            }
        })

        /**
         * The catalog lives twice: here, and as the server's allowlist. A key the backend does not
         * know is silently dropped on save, so an admin would pick a call-out, see it stick in the
         * form, and find it gone after the next reload — with nothing failing anywhere in between.
         */
        it('matches the backend allowlist exactly', async () => {
            const {SOUND_PRESETS} = await loadSoundboard()
            const py = readFileSync(resolve(__dirname, '../../../../backend/app/models/penalty.py'), 'utf8')
            const block = py.match(/SOUND_PRESET_KEYS = \(([\s\S]*?)\)/)
            expect(block).not.toBeNull()
            const backendKeys = [...block![1].matchAll(/"([a-z_]+)"/g)].map(m => m[1])

            expect([...backendKeys].sort()).toEqual(SOUND_PRESETS.map(p => p.key).sort())
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

    describe('renderPreset', () => {
        it('schedules into any context at the given time, without touching the live one', async () => {
            const {renderPreset} = await loadSoundboard()
            const ctx = new FakeAudioContext() as unknown as BaseAudioContext
            const startSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

            renderPreset(ctx, 'bell', 1.5)

            const osc = startSpy.mock.results[0].value as FakeOscillator
            expect(osc.start).toHaveBeenCalledWith(1.5)
        })

        it('applies a per-preset trim gain, and a louder one for the alarm presets', async () => {
            const {renderPreset} = await loadSoundboard()
            const ctx = new FakeAudioContext() as unknown as BaseAudioContext
            const gains = vi.spyOn(FakeAudioContext.prototype, 'createGain')

            // The trim is the first gain created after the shared bus, per render.
            renderPreset(ctx, 'buzzer', 0)
            const busGainCount = gains.mock.results.length
            gains.mockClear()
            renderPreset(ctx, 'applause', 0)

            expect(busGainCount).toBeGreaterThan(0)
            const trim = gains.mock.results[0].value as FakeGainNode
            // applause is the quietest preset acoustically, so it is trimmed up above unity.
            expect(trim.gain.value).toBeGreaterThan(1)
        })
    })

    describe('output bus', () => {
        it('builds the compressor/convolver chain once and reuses it across plays', async () => {
            const {playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(true)
            const compressorSpy = vi.spyOn(FakeAudioContext.prototype, 'createDynamicsCompressor')
            const convolverSpy = vi.spyOn(FakeAudioContext.prototype, 'createConvolver')

            playSound('bell')
            playSound('bell')
            playSound('laser')

            expect(compressorSpy).toHaveBeenCalledTimes(1)
            expect(convolverSpy).toHaveBeenCalledTimes(1)
        })

        it('still plays when the browser lacks a convolver, compressor or wave shaper', async () => {
            omitted = ['createConvolver', 'createDynamicsCompressor', 'createWaveShaper']
            const {playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(true)
            const createOscillatorSpy = vi.spyOn(FakeAudioContext.prototype, 'createOscillator')

            expect(() => playSound('buzzer')).not.toThrow()
            expect(createOscillatorSpy).toHaveBeenCalled()
        })
    })

    describe('distortion curve', () => {
        /**
         * Regression: with an even-length curve a WaveShaper maps silence to a small non-zero
         * constant, i.e. a DC offset that never decays. The offline audit caught the buzzer and air
         * horn emitting DC for as long as the audio context lived; this pins the fix.
         */
        it('maps silence to silence (odd point count, exact zero in the middle)', async () => {
            const {playSound, useEffectsStore} = await loadSoundboard()
            useEffectsStore.getState().setEffectsEnabled(true)
            const shaperSpy = vi.spyOn(FakeAudioContext.prototype, 'createWaveShaper')

            playSound('buzzer')

            const shaper = shaperSpy.mock.results[0].value as FakeWaveShaper
            const curve = shaper.curve!
            expect(curve.length % 2).toBe(1)
            expect(curve[(curve.length - 1) / 2]).toBe(0)
            expect(curve[0]).toBeCloseTo(-1, 5)
            expect(curve[curve.length - 1]).toBeCloseTo(1, 5)
        })
    })
})
