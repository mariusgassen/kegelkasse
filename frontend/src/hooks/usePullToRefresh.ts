import {useEffect, useRef, useState} from 'react'

const THRESHOLD = 70
const MAX_PULL = 100

export interface PullToRefresh {
    containerRef: React.RefObject<HTMLElement | null>
    /** 0..MAX_PULL — drives the indicator's opacity/rotation while dragging. */
    pullDistance: number
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
    const [refreshing, setRefreshing] = useState(false)
    const startY = useRef<number | null>(null)
    const busyRef = useRef(false)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        function onTouchStart(e: TouchEvent) {
            if (busyRef.current) {
                startY.current = null
                return
            }
            const scroller = (e.target as Element | null)?.closest('.page-scroll') ?? null
            if (!scroller || scroller.scrollTop > 0) {
                startY.current = null
                return
            }
            startY.current = e.touches[0].clientY
        }

        function onTouchMove(e: TouchEvent) {
            if (startY.current === null) return
            const delta = e.touches[0].clientY - startY.current
            setPullDistance(delta > 0 ? Math.min(delta, MAX_PULL) : 0)
        }

        function onTouchEnd() {
            if (startY.current === null) return
            startY.current = null
            setPullDistance((d) => {
                if (d >= THRESHOLD && !busyRef.current) {
                    busyRef.current = true
                    setRefreshing(true)
                    Promise.resolve(onRefresh()).finally(() => {
                        busyRef.current = false
                        setRefreshing(false)
                    })
                }
                return 0
            })
        }

        el.addEventListener('touchstart', onTouchStart, {passive: true})
        el.addEventListener('touchmove', onTouchMove, {passive: true})
        el.addEventListener('touchend', onTouchEnd)
        return () => {
            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
        }
    }, [onRefresh])

    return {containerRef, pullDistance, refreshing}
}
