import {useEffectsStore} from '@/store/effects'
import {showToast} from '@/components/ui/Toast'
import {ensureAudioContext} from '@/lib/audioContext'

export type CelebrationKind = 'king' | 'allnine'

const CONFETTI_COLORS = ['var(--accent-fg)', 'var(--accent-fg)', 'var(--ink)', '#ef4444', '#22c55e']
const CONFETTI_COUNT = 40
const CONFETTI_DURATION_MS = 1400

interface Particle {
    x: number; y: number; vx: number; vy: number
    rotation: number; vr: number; size: number; color: string
}

function playChime(kind: CelebrationKind) {
    const ctx = ensureAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    // C5 – E5 – G5 ascending arpeggio for both; Alle Neune adds a triumphant high C6.
    const notes = kind === 'allnine' ? [523.25, 659.25, 783.99, 1046.50] : [523.25, 659.25, 783.99]
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const start = now + i * 0.09
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.2, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.32)
    })
}

function burstConfetti() {
    const canvas = document.createElement('canvas')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    Object.assign(canvas.style, {position: 'fixed', inset: '0', zIndex: '2000', pointerEvents: 'none'})
    document.body.appendChild(canvas)

    const ctx = canvas.getContext('2d')
    if (!ctx) {
        canvas.remove()
        return
    }

    const particles: Particle[] = Array.from({length: CONFETTI_COUNT}, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.3,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }))

    const start = performance.now()
    let rafId = 0

    function frame(now: number) {
        ctx!.clearRect(0, 0, canvas.width, canvas.height)
        for (const p of particles) {
            p.x += p.vx
            p.y += p.vy
            p.vy += 0.05
            p.rotation += p.vr
            ctx!.save()
            ctx!.translate(p.x, p.y)
            ctx!.rotate((p.rotation * Math.PI) / 180)
            ctx!.fillStyle = p.color
            ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
            ctx!.restore()
        }
        if (now - start < CONFETTI_DURATION_MS) {
            rafId = requestAnimationFrame(frame)
        } else {
            canvas.remove()
        }
    }
    rafId = requestAnimationFrame(frame)

    // Safety net in case the tab is backgrounded and rAF stalls indefinitely.
    setTimeout(() => {
        cancelAnimationFrame(rafId)
        canvas.remove()
    }, CONFETTI_DURATION_MS + 500)
}

/** Fires a celebration: toast + short chime always, confetti unless the user has
 * `prefers-reduced-motion` set. No-ops entirely when the user disabled effects. */
export function celebrate(kind: CelebrationKind, message: string) {
    if (!useEffectsStore.getState().effectsEnabled) return
    showToast(message)
    playChime(kind)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!reducedMotion) burstConfetti()
}
