import {useEffect, useRef, useState} from 'react'
import {DURATION, flourishEnabled} from '@/lib/motion'

/** Ease-out cubic — fast off the mark, settling on the final digits. */
function easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3)
}

/**
 * Tween a number towards `value` over one rAF run (#72).
 *
 * Used for money and scores, where the figure *changing* is the point — a balance that counts up
 * to its new total reads as a transaction landing, where a silent swap reads as a re-render.
 *
 * Returns `value` verbatim, with no animation at all, when motion is off (reduced motion or the 🎉
 * switch), on the very first render (a page should not animate its opening balance from zero every
 * time it mounts) and wherever `requestAnimationFrame` is missing.
 */
export function useCountUp(value: number, duration: number = DURATION.base): number {
    const [display, setDisplay] = useState(value)
    const fromRef = useRef(value)
    const frameRef = useRef<number | null>(null)
    const landRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const seenRef = useRef(false)

    useEffect(() => {
        const from = fromRef.current
        fromRef.current = value

        // First value in, or nothing to animate between.
        const isFirst = !seenRef.current
        seenRef.current = true
        if (isFirst || from === value || !flourishEnabled() || typeof requestAnimationFrame !== 'function') {
            setDisplay(value)
            return
        }

        const start = performance.now()
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            setDisplay(from + (value - from) * easeOut(t))
            if (t < 1) frameRef.current = requestAnimationFrame(step)
            else frameRef.current = null
        }
        frameRef.current = requestAnimationFrame(step)

        // rAF is not a guarantee: browsers throttle or suspend it in a backgrounded tab, and a
        // frame stream that stops mid-tween would leave a wrong number on screen for as long as the
        // page stays hidden. This timer is the backstop that always lands the real value.
        landRef.current = setTimeout(() => setDisplay(value), duration + 50)

        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
            if (landRef.current !== null) clearTimeout(landRef.current)
            frameRef.current = null
            landRef.current = null
        }
    }, [value, duration])

    return display
}
