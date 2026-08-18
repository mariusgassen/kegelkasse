import {useEffectsStore} from '@/store/effects'
import {ensureAudioContext} from '@/lib/audioContext'

/**
 * Configurable audio call-outs (cherry-on-top feature): per-PenaltyType sounds an admin picks from
 * this preset catalog — e.g. assign the buzzer to a "0 pins" penalty type. Everything is synthesized
 * live through Web Audio: no audio files, no upload, no CDN, no storage.
 *
 * Synthesis notes — why this is more than a bank of oscillators:
 * A bare `OscillatorNode` with a 20 ms attack and an exponential fade is a *beep*. It can imitate a
 * pitch, but not a bell (whose partials are inharmonic and decay at different rates), a cash
 * register (a metallic transient plus a wooden drawer), a groan (vowel formants), a whistle (a
 * rattling pea), applause (dozens of noise transients) or a record scratch (a sample played back at
 * a swept rate). So the presets below are built from the wider toolbox the platform actually offers:
 *
 *   • inharmonic additive partials with per-partial decay   → real bell/metal timbres
 *   • FM (oscillator → gain → carrier.frequency)            → clangy, coin/ching-like spectra
 *   • band-passed noise off one shared, cached buffer       → transients, breath, rattle, applause
 *   • `AudioBufferSourceNode.playbackRate` automation       → the record scratch
 *   • parallel band-pass "formants" over a detuned stack    → vowel-ish crowd groan
 *   • `WaveShaperNode` soft clipping                        → buzzer/air-horn grit
 *   • LFO oscillators modulating frequency/gain             → vibrato, whistle trill, tremolo
 *   • one shared bus: convolution reverb (generated IR) + compressor
 *
 * The bus matters as much as the voices: every preset used to connect straight to `destination` and
 * pick its own peak gain, so they never sat at comparable loudness (the old buzzer had a code
 * comment excusing itself for being louder than its neighbours). Now they share a compressor, and a
 * short generated room so they don't sound bone-dry over a tablet speaker on the lane.
 *
 * Keys must match the backend allowlist (`models/penalty.py::SOUND_PRESET_KEYS`) — an unknown key
 * is silently dropped server-side, so `isSoundPresetKey` lets the UI stay in sync without a round trip.
 */
export type SoundPresetKey =
    | 'buzzer' | 'bell' | 'cash_register' | 'sad_trombone' | 'drum_hit' | 'crowd_groan' | 'laser'
    | 'whistle' | 'air_horn' | 'applause' | 'record_scratch' | 'coin_drop' | 'boing'

export interface SoundPresetInfo {
    key: SoundPresetKey
    emoji: string
    labelKey: string
}

export const SOUND_PRESETS: SoundPresetInfo[] = [
    {key: 'whistle', emoji: '⚽', labelKey: 'sound.preset.whistle'},
    {key: 'buzzer', emoji: '🚨', labelKey: 'sound.preset.buzzer'},
    {key: 'air_horn', emoji: '📣', labelKey: 'sound.preset.air_horn'},
    {key: 'bell', emoji: '🔔', labelKey: 'sound.preset.bell'},
    {key: 'cash_register', emoji: '💰', labelKey: 'sound.preset.cash_register'},
    {key: 'coin_drop', emoji: '🪙', labelKey: 'sound.preset.coin_drop'},
    {key: 'sad_trombone', emoji: '📉', labelKey: 'sound.preset.sad_trombone'},
    {key: 'crowd_groan', emoji: '😩', labelKey: 'sound.preset.crowd_groan'},
    {key: 'applause', emoji: '👏', labelKey: 'sound.preset.applause'},
    {key: 'drum_hit', emoji: '🥁', labelKey: 'sound.preset.drum_hit'},
    {key: 'record_scratch', emoji: '💿', labelKey: 'sound.preset.record_scratch'},
    {key: 'boing', emoji: '🪀', labelKey: 'sound.preset.boing'},
    {key: 'laser', emoji: '🔫', labelKey: 'sound.preset.laser'},
]

const SOUND_PRESET_KEYS = new Set<string>(SOUND_PRESETS.map(p => p.key))

export function isSoundPresetKey(key: string | null | undefined): key is SoundPresetKey {
    return !!key && SOUND_PRESET_KEYS.has(key)
}

// ── Shared output bus ────────────────────────────────────────────────────────

const MASTER_GAIN = 0.85
const REVERB_SEND = 0.14
const REVERB_SECONDS = 0.4

const busses = new WeakMap<BaseAudioContext, GainNode>()
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()

/**
 * Voices connect here, never to `ctx.destination` directly. The compressor is what lets a rasping
 * buzzer and a soft bell coexist at one volume setting; the small convolution send gives every
 * preset the same room so they read as one family instead of thirteen unrelated bleeps.
 *
 * Convolver/compressor/waveshaper are all feature-detected — the graph degrades to a plain gain
 * rather than throwing if a browser (or a test double) lacks one.
 */
function bus(ctx: BaseAudioContext): GainNode {
    const cached = busses.get(ctx)
    if (cached) return cached

    const input = ctx.createGain()
    input.gain.value = 1

    const master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ctx.destination)

    let tail: AudioNode = master
    if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.knee.value = 12
        comp.ratio.value = 6
        comp.attack.value = 0.004
        comp.release.value = 0.18
        comp.connect(master)
        tail = comp
    }

    input.connect(tail)

    if (typeof ctx.createConvolver === 'function') {
        const send = ctx.createGain()
        send.gain.value = REVERB_SEND
        const convolver = ctx.createConvolver()
        convolver.buffer = impulseResponse(ctx, REVERB_SECONDS)
        input.connect(send)
        send.connect(convolver)
        convolver.connect(tail)
    }

    busses.set(ctx, input)
    return input
}

/**
 * Per-preset output trim in linear gain, measured — not guessed. `scripts/audit-sounds.mjs` renders
 * every preset offline and reports its loudness; these numbers pull the catalog into one band so a
 * club can set the tablet volume once and have every call-out land at a usable level. Alarms
 * (buzzer, air horn, whistle) are deliberately left a couple of dB hotter than the rest: they are
 * supposed to cut through a room, and equal loudness is not the same as equal urgency.
 */
const PRESET_TRIM: Record<SoundPresetKey, number> = {
    whistle: 0.72,
    buzzer: 0.38,
    air_horn: 0.72,
    bell: 0.96,
    cash_register: 1.05,
    coin_drop: 0.93,
    sad_trombone: 0.84,
    crowd_groan: 1.35,
    applause: 2.45,
    drum_hit: 1.32,
    record_scratch: 1.88,
    boing: 1.27,
    laser: 2.19,
}

/**
 * Where a voice connects when a preset does not name an explicit node. `renderPreset` parks the
 * current preset's trim node here for the duration of its (entirely synchronous) scheduling pass,
 * so the presets below stay readable instead of threading an output argument through every single
 * call. Nothing async runs in between, so there is no interleaving to worry about.
 */
let activeOut: AudioNode | null = null

function target(ctx: BaseAudioContext, out?: AudioNode): AudioNode {
    return out ?? activeOut ?? bus(ctx)
}

/** A short, bright room: exponentially decaying noise. Cheap, and enough to stop sounds feeling dry. */
function impulseResponse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch)
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6)
        }
    }
    return buffer
}

/** One white-noise buffer per context, re-read at different offsets by every noise voice. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    const cached = noiseBuffers.get(ctx)
    if (cached) return cached
    const length = Math.max(1, Math.floor(ctx.sampleRate * 2))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseBuffers.set(ctx, buffer)
    return buffer
}

// ── Synthesis primitives ─────────────────────────────────────────────────────

interface EnvOptions {
    attack?: number
    decay: number
    peak: number
    /** Hold the peak this long before the decay starts (sustained sounds: horn, groan). */
    sustain?: number
}

/**
 * Amplitude envelope. The default attack is 3 ms, not the 20 ms the old helper used for everything:
 * a percussive sound whose attack is slower than its ear-perceived "click" reads as a beep.
 */
function envelope(ctx: BaseAudioContext, start: number, {attack = 0.003, decay, peak, sustain = 0}: EnvOptions): GainNode {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(peak, start + attack)
    if (sustain > 0) gain.gain.setValueAtTime(peak, start + attack + sustain)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + sustain + decay)
    return gain
}

function totalOf(env: EnvOptions): number {
    return (env.attack ?? 0.003) + (env.sustain ?? 0) + env.decay
}

interface ToneOptions extends EnvOptions {
    type?: OscillatorType
    /** Exponential glide target; omitted means a steady pitch. */
    to?: number
    /** Portion of the envelope the glide takes (0..1, default 1 = the whole voice). */
    glide?: number
    detune?: number
    out?: AudioNode
}

/** A single oscillator voice through its own envelope. */
function tone(ctx: BaseAudioContext, freq: number, start: number, opts: ToneOptions): OscillatorNode {
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, start)
    if (opts.detune) osc.detune.value = opts.detune
    const total = totalOf(opts)
    if (opts.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 1), start + total * (opts.glide ?? 1))
    }
    const env = envelope(ctx, start, opts)
    osc.connect(env)
    env.connect(target(ctx, opts.out))
    osc.start(start)
    osc.stop(start + total + 0.05)
    return osc
}

/**
 * Inharmonic additive stack — the thing a lone oscillator cannot do. A struck metal body rings at
 * frequency ratios that are not integers, and its high partials die away first; that uneven decay
 * is most of what makes the ear hear "bell" rather than "tone".
 */
function metal(ctx: BaseAudioContext, root: number, start: number, ratios: number[], decay: number, peak: number, out?: AudioNode) {
    ratios.forEach((ratio, i) => {
        tone(ctx, root * ratio, start, {
            type: 'sine',
            attack: 0.001,
            // Higher partials decay faster: the strike is bright, the tail is not.
            decay: decay * Math.pow(0.62, i),
            peak: peak * Math.pow(0.68, i),
            out,
        })
    })
}

interface FmOptions extends EnvOptions {
    /** Modulator frequency as a multiple of the carrier — non-integer ratios sound metallic. */
    ratio: number
    /** Peak frequency deviation in Hz. Decays with the note, so the attack is the brightest part. */
    index: number
    type?: OscillatorType
    to?: number
    out?: AudioNode
}

/** Frequency modulation: one oscillator driving another's frequency, which no filter can fake. */
function fm(ctx: BaseAudioContext, carrierFreq: number, start: number, opts: FmOptions) {
    const total = totalOf(opts)
    const carrier = ctx.createOscillator()
    carrier.type = opts.type ?? 'sine'
    carrier.frequency.setValueAtTime(carrierFreq, start)
    if (opts.to !== undefined) carrier.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 1), start + total)

    const modulator = ctx.createOscillator()
    modulator.type = 'sine'
    modulator.frequency.setValueAtTime(carrierFreq * opts.ratio, start)

    const depth = ctx.createGain()
    depth.gain.setValueAtTime(opts.index, start)
    depth.gain.exponentialRampToValueAtTime(Math.max(opts.index * 0.02, 1), start + total)

    modulator.connect(depth)
    depth.connect(carrier.frequency)

    const env = envelope(ctx, start, opts)
    carrier.connect(env)
    env.connect(target(ctx, opts.out))

    modulator.start(start)
    modulator.stop(start + total + 0.05)
    carrier.start(start)
    carrier.stop(start + total + 0.05)
}

interface NoiseOptions extends EnvOptions {
    type?: BiquadFilterType
    freq: number
    /** Sweep the filter to this frequency across the voice (whoosh, scratch, breath). */
    to?: number
    q?: number
    /** Playback-rate automation on the buffer itself — the record-scratch trick. */
    rate?: number
    rateTo?: number
    out?: AudioNode
}

/** Filtered noise off the shared buffer, read from a random offset so repeats never sound identical. */
function noise(ctx: BaseAudioContext, start: number, opts: NoiseOptions) {
    const total = totalOf(opts)
    const buffer = noiseBuffer(ctx)
    const src = ctx.createBufferSource()
    src.buffer = buffer

    if (opts.rate !== undefined) {
        src.playbackRate.setValueAtTime(opts.rate, start)
        if (opts.rateTo !== undefined) src.playbackRate.linearRampToValueAtTime(opts.rateTo, start + total)
    }

    const filter = ctx.createBiquadFilter()
    filter.type = opts.type ?? 'lowpass'
    filter.frequency.setValueAtTime(opts.freq, start)
    if (opts.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 20), start + total)
    if (opts.q !== undefined) filter.Q.value = opts.q

    const env = envelope(ctx, start, opts)
    src.connect(filter)
    filter.connect(env)
    env.connect(target(ctx, opts.out))

    // Random offset into the 2 s buffer, clamped so the read never runs off the end.
    const offset = Math.random() * Math.max(0, (buffer.duration || 2) - total - 0.05)
    src.start(start, offset, total + 0.05)
}

/**
 * Soft-clipping curve: adds harmonics (grit) instead of just making a voice louder.
 *
 * The point count must be **odd**. A WaveShaper maps input x to curve index `(x + 1) / 2 * (n - 1)`,
 * so with an even n the value for silence falls between two samples and interpolates to a small
 * non-zero constant — which is a DC offset that never ends. The offline audit caught exactly that:
 * the buzzer and air horn kept emitting -40 dBFS of DC for as long as the context ran.
 */
function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 1025
    const curve = new Float32Array(new ArrayBuffer(n * 4))
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1
        curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
    }
    return curve
}

function shaper(ctx: BaseAudioContext, amount: number, out?: AudioNode): AudioNode {
    const dest = target(ctx, out)
    if (typeof ctx.createWaveShaper !== 'function') return dest
    const node = ctx.createWaveShaper()
    node.curve = distortionCurve(amount)
    node.oversample = '2x'
    node.connect(dest)
    return node
}

/**
 * Parallel band-passes at vowel resonances. A voice is not a waveform, it is a spectrum shaped by a
 * throat — three formants over a detuned saw stack is the cheapest thing that reads as "a human
 * going *ohhh*" rather than as filtered wind, which is what the old crowd_groan actually was.
 */
function formants(ctx: BaseAudioContext, start: number, bands: Array<{freq: number; to?: number; q: number; gain: number}>, duration: number, out?: AudioNode): GainNode {
    const input = ctx.createGain()
    input.gain.value = 1
    const dest = target(ctx, out)
    for (const band of bands) {
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(band.freq, start)
        if (band.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(band.to, 20), start + duration)
        filter.Q.value = band.q
        const level = ctx.createGain()
        level.gain.value = band.gain
        input.connect(filter)
        filter.connect(level)
        level.connect(dest)
    }
    return input
}

/** LFO on an AudioParam — vibrato, whistle trill, tremolo. */
function lfo(ctx: BaseAudioContext, param: AudioParam, start: number, duration: number, rate: number, depth: number, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(rate, start)
    const amount = ctx.createGain()
    amount.gain.setValueAtTime(depth, start)
    osc.connect(amount)
    amount.connect(param)
    osc.start(start)
    osc.stop(start + duration + 0.05)
    return amount
}

// ── Presets ──────────────────────────────────────────────────────────────────

const RENDERERS: Record<SoundPresetKey, (ctx: BaseAudioContext, now: number) => void> = {
    /** Referee's whistle: two close high tones plus the rattling pea (a fast trill), and breath. */
    whistle: (ctx, now) => {
        const body = tone(ctx, 2350, now, {type: 'sine', attack: 0.012, sustain: 0.28, decay: 0.09, peak: 0.16})
        const upper = tone(ctx, 3180, now, {type: 'sine', attack: 0.014, sustain: 0.28, decay: 0.09, peak: 0.07})
        // ~24 Hz warble is the pea bouncing in the chamber — a steady tone reads as a test signal.
        lfo(ctx, body.frequency, now, 0.4, 24, 150)
        lfo(ctx, upper.frequency, now, 0.4, 24, 180)
        noise(ctx, now, {type: 'bandpass', freq: 2600, q: 2.5, attack: 0.01, sustain: 0.24, decay: 0.08, peak: 0.05})
    },

    /** Game-show "wrong answer": detuned low saws driven into a soft clipper, with a noise rasp. */
    buzzer: (ctx, now) => {
        const grit = shaper(ctx, 3.5)
        const body = ctx.createBiquadFilter()
        body.type = 'lowpass'
        body.frequency.value = 1600
        body.Q.value = 1.2
        body.connect(grit)
        for (const [freq, peak] of [[96, 0.2], [101, 0.19], [107, 0.16]] as const) {
            tone(ctx, freq, now, {type: 'sawtooth', attack: 0.006, sustain: 0.42, decay: 0.12, peak, out: body})
        }
        noise(ctx, now, {type: 'lowpass', freq: 420, attack: 0.006, sustain: 0.42, decay: 0.12, peak: 0.07, out: body})
    },

    /** Stadium air horn: a distorted harmonic stack that blooms into pitch instead of starting on it. */
    air_horn: (ctx, now) => {
        const grit = shaper(ctx, 2.2)
        const horn = ctx.createBiquadFilter()
        horn.type = 'bandpass'
        horn.frequency.setValueAtTime(700, now)
        horn.frequency.exponentialRampToValueAtTime(1500, now + 0.12)
        horn.Q.value = 0.8
        horn.connect(grit)
        for (const [freq, peak] of [[233, 0.24], [350, 0.18], [466, 0.12], [700, 0.07]] as const) {
            const voice = tone(ctx, freq * 0.94, now, {
                type: 'sawtooth', to: freq, glide: 0.12, attack: 0.02, sustain: 0.5, decay: 0.18, peak, out: horn,
            })
            lfo(ctx, voice.frequency, now, 0.75, 5.5, freq * 0.006)
        }
    },

    /** Struck bell: inharmonic partials with staggered decay, plus a bright strike transient. */
    bell: (ctx, now) => {
        metal(ctx, 587.33, now, [1, 2.04, 2.77, 4.18, 5.63], 1.5, 0.4)
        noise(ctx, now, {type: 'bandpass', freq: 5200, q: 1.4, attack: 0.001, decay: 0.05, peak: 0.2})
    },

    /** Ka-ching: metallic FM ring, a coin rattle, then the wooden thud of the drawer. */
    cash_register: (ctx, now) => {
        fm(ctx, 1480, now, {ratio: 1.47, index: 900, attack: 0.001, decay: 0.42, peak: 0.5})
        fm(ctx, 2260, now + 0.01, {ratio: 2.13, index: 700, attack: 0.001, decay: 0.3, peak: 0.3})
        noise(ctx, now, {type: 'bandpass', freq: 6200, q: 1.2, attack: 0.001, decay: 0.09, peak: 0.3})
        // Drawer: a low body drop plus a dull knock — the part that says "till", not "chime".
        tone(ctx, 150, now + 0.16, {type: 'sine', to: 62, attack: 0.002, decay: 0.16, peak: 0.2})
        noise(ctx, now + 0.16, {type: 'lowpass', freq: 320, attack: 0.001, decay: 0.12, peak: 0.14})
    },

    /** A coin landing and settling: metallic pings at shrinking intervals, then a rattle. */
    coin_drop: (ctx, now) => {
        const bounces = [0, 0.13, 0.22, 0.285, 0.33, 0.362, 0.386, 0.404]
        bounces.forEach((offset, i) => {
            const fall = Math.pow(0.82, i)
            fm(ctx, 2400 + i * 90, now + offset, {
                ratio: 1.62, index: 620 * fall, attack: 0.001, decay: 0.16 * fall + 0.03, peak: 0.42 * fall + 0.04,
            })
        })
        noise(ctx, now + 0.42, {type: 'bandpass', freq: 4200, to: 2600, q: 3, attack: 0.004, decay: 0.16, peak: 0.18})
    },

    /**
     * "Wah wah wah waaah". The classic is one instrument *sliding* between four falling notes with a
     * mouth opening and closing on each — so this is a single glissando voice with a filter that
     * re-opens per note, not four separate downward beeps.
     */
    sad_trombone: (ctx, now) => {
        const notes = [
            {freq: 349.23, at: 0, len: 0.3},
            {freq: 311.13, at: 0.3, len: 0.3},
            {freq: 277.18, at: 0.6, len: 0.3},
            {freq: 233.08, at: 0.9, len: 0.62},
        ]
        const total = 1.6
        const wah = ctx.createBiquadFilter()
        wah.type = 'lowpass'
        wah.Q.value = 6
        wah.connect(target(ctx))

        const amp = ctx.createGain()
        amp.gain.setValueAtTime(0.0001, now)
        amp.connect(wah)

        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(notes[0].freq, now)
        osc.connect(amp)

        notes.forEach((note, i) => {
            const at = now + note.at
            // Portamento into every note but the first — the slide is the trombone.
            if (i > 0) osc.frequency.exponentialRampToValueAtTime(note.freq, at + 0.07)
            amp.gain.linearRampToValueAtTime(0.17, at + 0.05)
            amp.gain.linearRampToValueAtTime(i === notes.length - 1 ? 0.14 : 0.06, at + note.len * 0.8)
            // The "wah": the mouth opens on the attack and closes again through the note.
            wah.frequency.setValueAtTime(600, at)
            wah.frequency.exponentialRampToValueAtTime(2400, at + 0.06)
            wah.frequency.exponentialRampToValueAtTime(520, at + note.len)
        })
        amp.gain.exponentialRampToValueAtTime(0.0001, now + total)
        // Vibrato only on the held final note, the way a player would.
        lfo(ctx, osc.frequency, now + 1.0, 0.5, 5.5, 4)

        osc.start(now)
        osc.stop(now + total + 0.05)
    },

    /** A room going "ohhh": detuned voices sliding down through shifting vowel formants. */
    crowd_groan: (ctx, now) => {
        const duration = 1.0
        // "oh" opening toward "aw" as the groan sags — a static filter sounds like wind, not people.
        const mouth = formants(ctx, now, [
            {freq: 520, to: 430, q: 7, gain: 0.55},
            {freq: 960, to: 820, q: 9, gain: 0.3},
            {freq: 2500, to: 2300, q: 11, gain: 0.09},
        ], duration)

        // Several detuned voices at slightly different pitches: nobody in a crowd groans in unison.
        for (const [freq, detune, peak] of [[152, -14, 0.72], [148, 9, 0.62], [163, 22, 0.45], [138, -25, 0.45]] as const) {
            const voice = tone(ctx, freq, now, {
                type: 'sawtooth', to: freq * 0.72, detune,
                attack: 0.09, sustain: 0.3, decay: duration - 0.39, peak, out: mouth,
            })
            lfo(ctx, voice.frequency, now, duration, 4.5 + Math.random(), 2.5)
        }
        noise(ctx, now, {type: 'bandpass', freq: 700, to: 500, q: 1.2, attack: 0.1, sustain: 0.3, decay: 0.5, peak: 0.14, out: mouth})
    },

    /** Sarcastic applause: dozens of noise transients off one buffer, swelling and thinning out. */
    applause: (ctx, now) => {
        const claps = 60
        const span = 1.35
        for (let i = 0; i < claps; i++) {
            // Randomised spacing — evenly spaced claps read as a machine gun, not a room.
            const at = now + Math.random() * span
            const progress = (at - now) / span
            // Swell in over the first fifth, thin out over the last third.
            const shape = Math.min(1, progress / 0.2) * (1 - Math.max(0, progress - 0.65) / 0.35 * 0.8)
            noise(ctx, at, {
                type: 'bandpass',
                freq: 1300 + Math.random() * 2200,
                q: 0.9 + Math.random(),
                attack: 0.001,
                decay: 0.02 + Math.random() * 0.03,
                peak: (0.2 + Math.random() * 0.18) * shape,
            })
        }
        // The low wash of a hall full of hands, under the individual claps.
        noise(ctx, now, {type: 'bandpass', freq: 900, q: 0.7, attack: 0.15, sustain: 0.5, decay: 0.6, peak: 0.16})
    },

    /** Drum hit: a pitch-dropping body (the skin) with a noise snap over it (the snares). */
    drum_hit: (ctx, now) => {
        tone(ctx, 210, now, {type: 'sine', to: 78, glide: 0.6, attack: 0.001, decay: 0.24, peak: 0.7})
        noise(ctx, now, {type: 'bandpass', freq: 1900, q: 0.8, attack: 0.001, decay: 0.16, peak: 0.5})
        noise(ctx, now, {type: 'highpass', freq: 6000, attack: 0.0005, decay: 0.03, peak: 0.3})
    },

    /** Record scratch: the buffer itself dragged backwards and forwards via playbackRate automation. */
    record_scratch: (ctx, now) => {
        const drag = (start: number, from: number, to: number, dur: number, peak: number) => {
            noise(ctx, start, {
                type: 'bandpass', freq: 900, to: 1700, q: 5, rate: from, rateTo: to,
                attack: 0.006, decay: dur, peak,
            })
            // The tonal "wob" of the groove under the surface noise.
            tone(ctx, 420 * from, start, {type: 'sawtooth', to: 420 * to, attack: 0.006, decay: dur, peak: peak * 0.4})
        }
        drag(now, 1.5, 0.5, 0.2, 0.85)
        drag(now + 0.22, 0.6, 1.7, 0.16, 0.7)
    },

    /** Cartoon spring: a fast fall with a wobble that settles — one glide alone just sounds like a slide. */
    boing: (ctx, now) => {
        const voice = tone(ctx, 760, now, {type: 'triangle', to: 150, glide: 0.7, attack: 0.002, decay: 0.5, peak: 0.55})
        // Wobble depth decays with the note: the spring stops ringing as it comes to rest.
        const depth = lfo(ctx, voice.frequency, now, 0.5, 13, 220)
        depth.gain.exponentialRampToValueAtTime(4, now + 0.5)
        noise(ctx, now, {type: 'bandpass', freq: 1400, q: 2, attack: 0.001, decay: 0.05, peak: 0.2})
    },

    /** Laser: a hard down-sweep with FM sidebands, so it zaps instead of merely gliding. */
    laser: (ctx, now) => {
        fm(ctx, 2400, now, {ratio: 1.73, index: 1400, to: 150, type: 'sawtooth', attack: 0.001, decay: 0.26, peak: 0.55})
        noise(ctx, now, {type: 'bandpass', freq: 3500, to: 400, q: 2, attack: 0.001, decay: 0.18, peak: 0.2})
    },
}

/**
 * Schedule a preset into any context at any time. Split out from `render` so the synthesis can be
 * rendered into an `OfflineAudioContext` and measured (level, attack, decay, spectrum) instead of
 * only being judged by ear — see `scripts/audit-sounds.mjs`.
 */
export function renderPreset(ctx: BaseAudioContext, key: SoundPresetKey, at: number): void {
    const trim = ctx.createGain()
    trim.gain.value = PRESET_TRIM[key]
    trim.connect(bus(ctx))
    activeOut = trim
    try {
        RENDERERS[key](ctx, at)
    } finally {
        activeOut = null
    }
}

function render(key: SoundPresetKey) {
    const ctx = ensureAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    renderPreset(ctx, key, ctx.currentTime)
}

/** Play a call-out for real gameplay — respects the 🎉 effects switch, like haptics and confetti. */
export function playSound(key: string | null | undefined): void {
    if (!isSoundPresetKey(key)) return
    if (!useEffectsStore.getState().effectsEnabled) return
    render(key)
}

/** Play a preset regardless of the effects switch — an explicit "let me hear it" tap in the picker. */
export function previewSound(key: SoundPresetKey): void {
    render(key)
}
