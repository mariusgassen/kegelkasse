import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {useCountUp} from '@/hooks/useCountUp'
import {useEffectsStore} from '@/store/effects'

/** Drives rAF manually so the tween can be stepped frame by frame. */
function installFrameClock() {
    let now = 0
    const queue: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        queue.push(cb)
        return queue.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('performance', {now: () => now})
    return {
        /** Advance the clock and flush exactly one queued frame. */
        step(ms: number) {
            now += ms
            const cb = queue.shift()
            if (cb) act(() => cb(now))
        },
        get pending() {
            return queue.length
        },
    }
}

describe('useCountUp', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
        vi.stubGlobal('matchMedia', (q: string) => ({matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn()}))
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    /** A page must not animate its opening balance up from zero every time it mounts. */
    it('shows the first value immediately without animating', () => {
        const {result} = renderHook(() => useCountUp(42))
        expect(result.current).toBe(42)
    })

    it('tweens towards a new value and lands exactly on it', () => {
        const clock = installFrameClock()
        const {result, rerender} = renderHook(({v}) => useCountUp(v, 200), {initialProps: {v: 0}})
        expect(result.current).toBe(0)

        rerender({v: 100})
        clock.step(100)
        // Ease-out is past the halfway mark at half the duration, and not yet arrived.
        expect(result.current).toBeGreaterThan(50)
        expect(result.current).toBeLessThan(100)

        clock.step(100)
        expect(result.current).toBe(100)
    })

    it('counts down as readily as up', () => {
        const clock = installFrameClock()
        const {result, rerender} = renderHook(({v}) => useCountUp(v, 200), {initialProps: {v: 100}})
        rerender({v: 20})
        clock.step(100)
        expect(result.current).toBeLessThan(100)
        expect(result.current).toBeGreaterThan(20)
        clock.step(100)
        expect(result.current).toBe(20)
    })

    it('snaps straight to the value when motion is switched off', () => {
        const clock = installFrameClock()
        useEffectsStore.setState({effectsEnabled: false})
        const {result, rerender} = renderHook(({v}) => useCountUp(v, 200), {initialProps: {v: 0}})
        rerender({v: 100})
        expect(result.current).toBe(100)
        expect(clock.pending).toBe(0)
    })

    it('snaps straight to the value under prefers-reduced-motion', () => {
        installFrameClock()
        vi.stubGlobal('matchMedia', (q: string) => ({
            matches: q.includes('prefers-reduced-motion'), media: q,
            addEventListener: vi.fn(), removeEventListener: vi.fn(),
        }))
        const {result, rerender} = renderHook(({v}) => useCountUp(v, 200), {initialProps: {v: 0}})
        rerender({v: 7})
        expect(result.current).toBe(7)
    })

    /**
     * rAF is suspended in a backgrounded tab. Without the timer backstop a tween interrupted
     * mid-flight would leave a wrong number on screen until the page is looked at again.
     */
    it('lands the real value even if the frame stream stops', async () => {
        vi.useFakeTimers()
        try {
            const queue: FrameRequestCallback[] = []
            vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb))
            vi.stubGlobal('cancelAnimationFrame', () => {})

            const {result, rerender} = renderHook(({v}) => useCountUp(v, 200), {initialProps: {v: 0}})
            rerender({v: 100})
            queue.length = 0  // frames stop being delivered

            expect(result.current).toBe(0)
            await act(async () => {
                vi.advanceTimersByTime(300)
            })
            expect(result.current).toBe(100)
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not animate when the value is unchanged', () => {
        const clock = installFrameClock()
        const {result, rerender} = renderHook(({v}) => useCountUp(v, 200), {initialProps: {v: 5}})
        rerender({v: 5})
        expect(result.current).toBe(5)
        expect(clock.pending).toBe(0)
    })
})
