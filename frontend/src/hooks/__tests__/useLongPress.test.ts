import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLongPress } from '../useLongPress'

describe('useLongPress', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('navigator', { ...navigator, vibrate: vi.fn() })
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    function fireClick(handlers: ReturnType<typeof useLongPress>) {
        const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any
        handlers.onClick(e)
        return e
    }

    function down(x = 0, y = 0, extra: Record<string, unknown> = {}) {
        return { clientX: x, clientY: y, pointerId: 1, currentTarget: {}, preventDefault: vi.fn(), ...extra } as any
    }

    function move(x: number, y: number) {
        return { clientX: x, clientY: y, pointerId: 1 } as any
    }

    it('fires onClick on a quick tap (no long press)', () => {
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick, onLongPress }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { result.current.onPointerUp({} as any) })
        fireClick(result.current)

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('fires onLongPress after holding past the threshold', () => {
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick, onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onClick).not.toHaveBeenCalled()
    })

    it('suppresses the click that follows a long press', () => {
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick, onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { vi.advanceTimersByTime(500) })
        const e = fireClick(result.current)

        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onClick).not.toHaveBeenCalled()
        expect(e.preventDefault).toHaveBeenCalled()
    })

    it('cancels the pending long press on pointer up before the threshold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { vi.advanceTimersByTime(200) })
        act(() => { result.current.onPointerUp({} as any) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('cancels the pending long press once the pointer moves past the drag threshold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown(down(0, 0)) })
        act(() => { result.current.onPointerMove(move(0, 20)) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('tolerates small pointer jitter on tiny touch targets without cancelling', () => {
        // Regression: small reaction pills used to lose the long-press to a stray
        // pointerleave/pointerout fired by sub-pixel touch jitter even when the finger
        // never intentionally moved off the element.
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown(down(0, 0)) })
        act(() => { result.current.onPointerMove(move(3, 2)) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).toHaveBeenCalledTimes(1)
    })

    it('blocks the touch default action on press-start, so iOS cannot start its own text-selection/callout gesture', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn() }))
        const e = down(0, 0, { pointerType: 'touch' })

        act(() => { result.current.onPointerDown(e) })

        expect(e.preventDefault).toHaveBeenCalled()
    })

    it('leaves mouse/pen presses alone (no need to block their default action)', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn() }))
        const e = down(0, 0, { pointerType: 'mouse' })

        act(() => { result.current.onPointerDown(e) })

        expect(e.preventDefault).not.toHaveBeenCalled()
    })

    it('prevents the native context menu', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn() }))
        const e = { preventDefault: vi.fn() } as any
        result.current.onContextMenu(e)
        expect(e.preventDefault).toHaveBeenCalled()
    })

    it('vibrates once the hold triggers', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn(), ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        expect(navigator.vibrate).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(500) })

        expect(navigator.vibrate).toHaveBeenCalledWith(15)
    })

    it('vibrates again when the finger lifts off after a successful hold', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn(), ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { vi.advanceTimersByTime(500) })
        act(() => { result.current.onPointerUp({} as any) })

        expect(navigator.vibrate).toHaveBeenNthCalledWith(1, 15)
        expect(navigator.vibrate).toHaveBeenNthCalledWith(2, 10)
    })

    it('does not vibrate on release for an ordinary tap that never triggered a hold', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn(), ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { vi.advanceTimersByTime(100) })
        act(() => { result.current.onPointerUp({} as any) })

        expect(navigator.vibrate).not.toHaveBeenCalled()
    })

    it('vibrates on pointer cancel too, if the hold had already triggered', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn(), ms: 500 }))

        act(() => { result.current.onPointerDown(down()) })
        act(() => { vi.advanceTimersByTime(500) })
        act(() => { result.current.onPointerCancel({} as any) })

        expect(navigator.vibrate).toHaveBeenNthCalledWith(2, 10)
    })
})
