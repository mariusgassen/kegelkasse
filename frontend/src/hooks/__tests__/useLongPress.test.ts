import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLongPress } from '../useLongPress'

describe('useLongPress', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    function fireClick(handlers: ReturnType<typeof useLongPress>) {
        const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any
        handlers.onClick(e)
        return e
    }

    it('fires onClick on a quick tap (no long press)', () => {
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick, onLongPress }))

        act(() => { result.current.onPointerDown({} as any) })
        act(() => { result.current.onPointerUp({} as any) })
        fireClick(result.current)

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('fires onLongPress after holding past the threshold', () => {
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick, onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown({} as any) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onClick).not.toHaveBeenCalled()
    })

    it('suppresses the click that follows a long press', () => {
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick, onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown({} as any) })
        act(() => { vi.advanceTimersByTime(500) })
        const e = fireClick(result.current)

        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onClick).not.toHaveBeenCalled()
        expect(e.preventDefault).toHaveBeenCalled()
    })

    it('cancels the pending long press on pointer up before the threshold', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown({} as any) })
        act(() => { vi.advanceTimersByTime(200) })
        act(() => { result.current.onPointerUp({} as any) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('cancels the pending long press on pointer leave', () => {
        const onLongPress = vi.fn()
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress, ms: 500 }))

        act(() => { result.current.onPointerDown({} as any) })
        act(() => { result.current.onPointerLeave({} as any) })
        act(() => { vi.advanceTimersByTime(500) })

        expect(onLongPress).not.toHaveBeenCalled()
    })

    it('prevents the native context menu', () => {
        const { result } = renderHook(() => useLongPress({ onClick: vi.fn(), onLongPress: vi.fn() }))
        const e = { preventDefault: vi.fn() } as any
        result.current.onContextMenu(e)
        expect(e.preventDefault).toHaveBeenCalled()
    })
})
