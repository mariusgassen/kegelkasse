import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnline } from '../useOnline'

describe('useOnline', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('returns true when navigator.onLine is true', () => {
        vi.stubGlobal('navigator', { onLine: true })
        const { result } = renderHook(() => useOnline())
        expect(result.current).toBe(true)
    })

    it('returns false when navigator.onLine is false', () => {
        vi.stubGlobal('navigator', { onLine: false })
        const { result } = renderHook(() => useOnline())
        expect(result.current).toBe(false)
    })

    it('updates to false when offline event fires', () => {
        vi.stubGlobal('navigator', { onLine: true })
        const { result } = renderHook(() => useOnline())
        expect(result.current).toBe(true)

        act(() => {
            window.dispatchEvent(new Event('offline'))
        })
        expect(result.current).toBe(false)
    })

    it('updates to true when online event fires', () => {
        vi.stubGlobal('navigator', { onLine: false })
        const { result } = renderHook(() => useOnline())
        expect(result.current).toBe(false)

        act(() => {
            window.dispatchEvent(new Event('online'))
        })
        expect(result.current).toBe(true)
    })

    it('removes event listeners on unmount', () => {
        vi.stubGlobal('navigator', { onLine: true })
        const removeEventListener = vi.spyOn(window, 'removeEventListener')
        const { unmount } = renderHook(() => useOnline())
        unmount()
        expect(removeEventListener).toHaveBeenCalledWith('online', expect.any(Function))
        expect(removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
        removeEventListener.mockRestore()
    })
})
