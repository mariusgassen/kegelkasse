import {useRef} from 'react'
import type {MouseEvent, PointerEvent} from 'react'

interface Options {
    onLongPress: () => void
    onClick?: () => void
    ms?: number
}

/** Distinguishes a tap (fires onClick) from a press-and-hold (fires onLongPress). */
export function useLongPress({onLongPress, onClick, ms = 500}: Options) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const firedRef = useRef(false)

    function clear() {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }

    function start() {
        firedRef.current = false
        clear()
        timerRef.current = setTimeout(() => {
            firedRef.current = true
            onLongPress()
        }, ms)
    }

    return {
        onPointerDown: (_e: PointerEvent) => start(),
        onPointerUp: (_e: PointerEvent) => clear(),
        onPointerLeave: (_e: PointerEvent) => clear(),
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
