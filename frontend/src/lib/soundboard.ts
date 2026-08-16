import {useEffectsStore} from '@/store/effects'
import {ensureAudioContext} from '@/lib/audioContext'

/**
 * Configurable audio call-outs (cherry-on-top feature): a fixed 0-pin buzzer plus per-PenaltyType
 * sounds an admin picks from this preset catalog. All synthesized via Web Audio — no audio file
 * uploads, no CDN, no storage — same zero-dependency approach as the chimes in `celebrate.ts`
 * (which now shares this module's `ensureAudioContext()` singleton instead of opening its own).
 *
 * Keys must match the backend allowlist (`models/penalty.py::SOUND_PRESET_KEYS`) — an unknown key
 * is silently dropped server-side, so `isSoundPresetKey` lets the UI stay in sync without a round trip.
 */
export type SoundPresetKey =
    | 'buzzer' | 'bell' | 'cash_register' | 'sad_trombone' | 'drum_hit' | 'crowd_groan' | 'laser'

export interface SoundPresetInfo {
    key: SoundPresetKey
    emoji: string
    labelKey: string
}

export const SOUND_PRESETS: SoundPresetInfo[] = [
    {key: 'buzzer', emoji: '🚨', labelKey: 'sound.preset.buzzer'},
    {key: 'bell', emoji: '🔔', labelKey: 'sound.preset.bell'},
    {key: 'cash_register', emoji: '💰', labelKey: 'sound.preset.cash_register'},
    {key: 'sad_trombone', emoji: '📉', labelKey: 'sound.preset.sad_trombone'},
    {key: 'drum_hit', emoji: '🥁', labelKey: 'sound.preset.drum_hit'},
    {key: 'crowd_groan', emoji: '😩', labelKey: 'sound.preset.crowd_groan'},
    {key: 'laser', emoji: '🔫', labelKey: 'sound.preset.laser'},
]

const SOUND_PRESET_KEYS = new Set<string>(SOUND_PRESETS.map(p => p.key))

export function isSoundPresetKey(key: string | null | undefined): key is SoundPresetKey {
    return !!key && SOUND_PRESET_KEYS.has(key)
}

// ── Synthesis primitives ──

function tone(ctx: AudioContext, freq: number, type: OscillatorType, start: number, duration: number, peakGain = 0.2) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
}

function sweep(ctx: AudioContext, freqFrom: number, freqTo: number, type: OscillatorType, start: number, duration: number, peakGain = 0.2) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freqFrom, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), start + duration)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
}

/** White noise burst through a lowpass — the only way Web Audio makes a percussive/vocal "thud". */
function noiseBurst(ctx: AudioContext, start: number, duration: number, filterFreq = 1200, peakGain = 0.25) {
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = filterFreq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start(start)
    src.stop(start + duration + 0.02)
}

// ── Presets ──

const RENDERERS: Record<SoundPresetKey, (ctx: AudioContext, now: number) => void> = {
    buzzer: (ctx, now) => {
        // Two close low square oscillators beating against each other — the classic game-show
        // "wrong answer" buzz — held for half a second then cut.
        tone(ctx, 110, 'square', now, 0.5, 0.18)
        tone(ctx, 116, 'square', now, 0.5, 0.18)
    },
    bell: (ctx, now) => {
        tone(ctx, 880, 'sine', now, 0.9, 0.22)
        tone(ctx, 1760, 'sine', now, 0.6, 0.06)
    },
    cash_register: (ctx, now) => {
        tone(ctx, 1318.51, 'triangle', now, 0.12, 0.2)
        tone(ctx, 1567.98, 'triangle', now + 0.1, 0.25, 0.2)
    },
    sad_trombone: (ctx, now) => {
        sweep(ctx, 330, 220, 'sawtooth', now, 0.32, 0.18)
        sweep(ctx, 294, 196, 'sawtooth', now + 0.3, 0.32, 0.18)
        sweep(ctx, 262, 155, 'sawtooth', now + 0.6, 0.45, 0.18)
    },
    drum_hit: (ctx, now) => {
        noiseBurst(ctx, now, 0.18, 220, 0.3)
        tone(ctx, 90, 'sine', now, 0.18, 0.25)
    },
    crowd_groan: (ctx, now) => {
        noiseBurst(ctx, now, 0.7, 500, 0.16)
        sweep(ctx, 300, 140, 'sawtooth', now, 0.7, 0.05)
    },
    laser: (ctx, now) => {
        sweep(ctx, 1800, 120, 'sawtooth', now, 0.2, 0.18)
    },
}

function render(key: SoundPresetKey) {
    const ctx = ensureAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    RENDERERS[key](ctx, ctx.currentTime)
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
