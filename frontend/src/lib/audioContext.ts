/**
 * A single shared Web Audio context for the whole app (celebrate.ts chimes, soundboard.ts
 * call-outs). One context, not one per caller — browsers cap how many can run concurrently,
 * and there is no reason for two synth modules to each open their own audio hardware handle.
 */
function getAudioCtor(): typeof AudioContext | null {
    const w = window as any
    return w.AudioContext || w.webkitAudioContext || null
}

let audioCtx: AudioContext | null = null

export function ensureAudioContext(): AudioContext | null {
    const Ctor = getAudioCtor()
    if (!Ctor) return null
    if (!audioCtx) audioCtx = new Ctor()
    return audioCtx
}

// Warm the context up on the very first tap anywhere in the app. Playback often runs after an
// `await api.someMutation(...)`, which is no longer in the same synchronous task as the user's
// tap — some browsers' autoplay gate rejects audio started that late, so the context is
// created/resumed here instead, decoupled from any specific trigger.
if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', () => {
        const ctx = ensureAudioContext()
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    }, {once: true})
}
