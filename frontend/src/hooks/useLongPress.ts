import {useRef} from 'react'
import type {MouseEvent, PointerEvent} from 'react'

interface Options {
    onLongPress: () => void
    onClick?: () => void
    ms?: number
}

/** Pointer movement (px) beyond which a press is treated as a drag/scroll and cancelled. */
const MOVE_THRESHOLD = 12

/** Distinguishes a tap (fires onClick) from a press-and-hold (fires onLongPress). */
export function useLongPress({onLongPress, onClick, ms = 500}: Options) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const firedRef = useRef(false)
    const startRef = useRef<{x: number; y: number} | null>(null)

    function clear() {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        startRef.current = null
    }

    function start(e: PointerEvent) {
        firedRef.current = false
        clear()
        startRef.current = {x: e.clientX, y: e.clientY}
        // Capturing the pointer keeps pointerup/pointermove targeted at this element even if
        // the touch contact point drifts slightly outside its (often small) hit box mid-press —
        // small reaction pills otherwise lose the press to a stray pointerleave/pointerout.
        const target = e.currentTarget as (EventTarget & {setPointerCapture?: (id: number) => void}) | null
        target?.setPointerCapture?.(e.pointerId)
        // CSS alone (user-select/-webkit-touch-callout: none) doesn't reliably stop iOS Safari from
        // starting its native text-selection/callout gesture on a touch hold — it races our own timer
        // below. Blocking the touch's default action here is what actually suppresses it.
        if (e.pointerType === 'touch') e.preventDefault()
        timerRef.current = setTimeout(() => {
            firedRef.current = true
            onLongPress()
        }, ms)
    }

    function move(e: PointerEvent) {
        if (!startRef.current) return
        const dx = e.clientX - startRef.current.x
        const dy = e.clientY - startRef.current.y
        if (Math.hypot(dx, dy) > MOVE_THRESHOLD) clear()
    }

    return {
        onPointerDown: (e: PointerEvent) => start(e),
        onPointerMove: (e: PointerEvent) => move(e),
        onPointerUp: (_e: PointerEvent) => clear(),
        onPointerCancel: (_e: PointerEvent) => clear(),
        onClick: (e: MouseEvent) => {
            if (firedRef.current) {
                e.preventDefault()
                e.stopPropagation()
                firedRef.current = false
                return
            }
            onClick?.()
        },
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
    }
}
