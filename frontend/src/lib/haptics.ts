import {useEffectsStore} from '@/store/effects'

/**
 * A small vibration vocabulary (#72), so feedback is chosen by *meaning* rather than by pattern.
 *
 * Before this, `navigator.vibrate` appeared once, in `useLongPress`, with two bare numbers baked
 * into it. Naming the patterns is what lets the same "you did it" pulse show up for a confirmed
 * penalty, a saved booking and a long-press — without each call site inventing its own rhythm.
 *
 * Deliberately *not* gated on `prefers-reduced-motion`: haptics are not motion, and a member who
 * suppresses animation may still want to feel a confirmation. The 🎉 effects switch (#62) does
 * silence them, since that is an explicit "less please".
 *
 * iOS Safari has no Vibration API at all, so `?.()` makes every call a no-op there.
 */
export type HapticPattern =
    | 'selection'  // a choice registered: pill picked, row selected, toggle flipped
    | 'impact'     // something latched: long-press opened, sheet snapped
    | 'success'    // an action completed: booking saved, penalty logged
    | 'warning'    // accepted, but look at it
    | 'error'      // rejected: failed request, invalid input

const PATTERNS: Record<HapticPattern, number | number[]> = {
    selection: 10,
    impact: 15,
    success: [12, 40, 18],
    warning: [18, 60, 18],
    error: [28, 60, 28],
}

export function haptic(pattern: HapticPattern): void {
    if (!useEffectsStore.getState().effectsEnabled) return
    if (typeof navigator === 'undefined') return
    navigator.vibrate?.(PATTERNS[pattern])
}

/** Exposed for tests and for the rare caller that needs the raw pattern. */
export function hapticPattern(pattern: HapticPattern): number | number[] {
    return PATTERNS[pattern]
}
