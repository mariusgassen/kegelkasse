import {useEffect, useRef, useState} from 'react'

export const PULL_THRESHOLD = 70
const THRESHOLD = PULL_THRESHOLD
const MAX_PULL = 100
/** Resting pull amount while a refresh is in flight — keeps the indicator visible in a
 *  stable spot instead of snapping to 0 immediately and jumping again once data arrives. */
const PARKED = 50
/** Touch movement (px) required before a gesture commits to vertical (pull) vs horizontal
 *  (e.g. scrolling a tab strip) — avoids treating incidental vertical jitter during a
 *  horizontal swipe as a pull-to-refresh drag. */
const DIRECTION_SLOP = 6

export interface PullToRefresh {
    containerRef: React.RefObject<HTMLElement | null>
    /** 0..MAX_PULL while dragging, PARKED while refreshing, 0 once settled. */
    pullDistance: number
    /** True only while a committed vertical drag is in progress (finger down, direction locked). */
    dragging: boolean
    refreshing: boolean
}

/**
 * Delegated pull-to-refresh. Listens on a stable ancestor (e.g. <main>, which itself doesn't
 * scroll) and resolves the actual scrolling element per-touch via the shared `.page-scroll`
 * class each page's root div already carries — avoids wiring every page individually.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void): PullToRefresh {
    const containerRef = useRef<HTMLElement>(null)
    const [pullDistance, setPullDistance] = useState(0)
    const [dragging, setDragging] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const startX = useRef<number | null>(null)
    const startY = useRef<number | null>(null)
    const direction = useRef<'vertical' | 'horizontal' | null>(null)
    const busyRef = useRef(false)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        function reset() {
            startX.current = null
            startY.current = null
            direction.current = null
            setDragging(false)
        }

        function onTouchStart(e: TouchEvent) {
            reset()
            if (busyRef.current) return
            const scroller = (e.target as Element | null)?.closest('.page-scroll') ?? null
            if (!scroller || scroller.scrollTop > 0) return
            startX.current = e.touches[0].clientX
            startY.current = e.touches[0].clientY
        }

        function onTouchMove(e: TouchEvent) {
            if (startY.current === null || startX.current === null) return
            const dx = e.touches[0].clientX - startX.current
            const dy = e.touches[0].clientY - startY.current

            if (direction.current === null) {
                if (Math.abs(dx) < DIRECTION_SLOP && Math.abs(dy) < DIRECTION_SLOP) return
                direction.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
                if (direction.current === 'horizontal') {
                    reset()
                    return
                }
                setDragging(true)
            }
            setPullDistance(dy > 0 ? Math.min(dy, MAX_PULL) : 0)
        }

        function onTouchEnd() {
            const wasVertical = direction.current === 'vertical'
            reset()
            if (!wasVertical) return
            setPullDistance((d) => {
                if (d >= THRESHOLD && !busyRef.current) {
                    busyRef.current = true
                    setRefreshing(true)
                    Promise.resolve(onRefresh()).finally(() => {
                        busyRef.current = false
                        setRefreshing(false)
                        setPullDistance(0)
                    })
                    return PARKED
                }
                return 0
            })
        }

        // Unlike touchend, a cancelled gesture (interrupted by the OS/browser) never triggers
        // a refresh — just abort and snap back, regardless of how far it had been pulled.
        function onTouchCancel() {
            reset()
            setPullDistance(0)
        }

        el.addEventListener('touchstart', onTouchStart, {passive: true})
        el.addEventListener('touchmove', onTouchMove, {passive: true})
        el.addEventListener('touchend', onTouchEnd)
        el.addEventListener('touchcancel', onTouchCancel)
        return () => {
            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
            el.removeEventListener('touchcancel', onTouchCancel)
        }
    }, [onRefresh])

    return {containerRef, pullDistance, dragging, refreshing}
}
