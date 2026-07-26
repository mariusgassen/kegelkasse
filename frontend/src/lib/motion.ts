import {useEffectsStore} from '@/store/effects'

/**
 * The app's motion vocabulary (#72).
 *
 * These are the JS twins of the `--motion-*` / `--ease-*` custom properties in `index.css`; both
 * sides must stay in step, and a test pins them to each other. Before this existed every animation
 * picked its own number — `.22s`, `.18s`, `.12s`, `2s` and three different easing curves across
 * eight keyframe blocks — so nothing shared a rhythm and each new animation guessed again.
 *
 * Pick by *role*, not by number:
 *   `fast`  — a control acknowledging a touch (press states, chevrons, colour swaps)
 *   `base`  — something entering or leaving (sheets, page panes, toasts, count-ups)
 *   `slow`  — a whole view rearranging (view transitions, shared-element morphs)
 *   `ambient` — a loop that must never demand attention (skeleton shimmer, the bobbing logo)
 */
export const DURATION = {
    fast: 120,
    base: 220,
    slow: 400,
    ambient: 1400,
} as const

export const EASING = {
    /** Enter: fast out of the gate, settling gently. The default for anything appearing. */
    standard: 'cubic-bezier(.2, 0, 0, 1)',
    /** Exit: leaves quickly, no lingering. */
    exit: 'cubic-bezier(.4, 0, 1, 1)',
    /** A touch of overshoot, for something that should feel physical (pop, morph). */
    spring: 'cubic-bezier(.34, 1.4, .64, 1)',
} as const

export type MotionDuration = keyof typeof DURATION
export type MotionEasing = keyof typeof EASING

/**
 * The OS-level "I do not want animation" signal. Treated as false where `matchMedia` is missing
 * (jsdom, very old webviews) — the safe default there is the app's normal behaviour.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Whether the *optional* flourishes may run: count-ups, haptics, the shared-element morph.
 *
 * Two gates, on purpose. `prefersReducedMotion()` alone governs structural motion — a skeleton
 * still has to render while data loads, it just holds still. The 🎉 celebration switch (#62) is an
 * explicit "less please" from the member, so it additionally silences the extras.
 */
export function flourishEnabled(): boolean {
    if (prefersReducedMotion()) return false
    return useEffectsStore.getState().effectsEnabled
}
