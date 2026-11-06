import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest'
import {renderHook, act, waitFor} from '@testing-library/react'

const registerSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({registerSW: (...args: unknown[]) => registerSW(...args)}))

function stubServiceWorkerSupport(supported: boolean) {
    if (supported) {
        Object.defineProperty(navigator, 'serviceWorker', {value: {}, configurable: true})
    } else {
        delete (navigator as {serviceWorker?: unknown}).serviceWorker
    }
}

describe('useSwUpdate', () => {
    beforeEach(() => {
        registerSW.mockReset()
        stubServiceWorkerSupport(true)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /** Pretend the app has been open for a while so the post-launch auto-apply does not kick in. */
    function afterLaunchWindow() {
        const later = Date.now() + 60_000
        vi.spyOn(Date, 'now').mockReturnValue(later)
    }

    it('does nothing when the browser has no service worker support', async () => {
        stubServiceWorkerSupport(false)
        const {useSwUpdate} = await import('../useSwUpdate')
        const {result} = renderHook(() => useSwUpdate())
        expect(result.current.needRefresh).toBe(false)
        expect(registerSW).not.toHaveBeenCalled()
    })

    it('registers the service worker and flips needRefresh on onNeedRefresh', async () => {
        let onNeedRefresh: (() => void) | undefined
        registerSW.mockImplementation((opts: {onNeedRefresh?: () => void}) => {
            onNeedRefresh = opts.onNeedRefresh
            return vi.fn().mockResolvedValue(undefined)
        })
        const {useSwUpdate} = await import('../useSwUpdate')
        const {result} = renderHook(() => useSwUpdate())

        expect(result.current.needRefresh).toBe(false)
        afterLaunchWindow()
        act(() => onNeedRefresh?.())
        await waitFor(() => expect(result.current.needRefresh).toBe(true))
    })

    it('applyUpdate calls the registered update function with reload=true', async () => {
        const update = vi.fn().mockResolvedValue(undefined)
        registerSW.mockImplementation(() => update)
        const {useSwUpdate} = await import('../useSwUpdate')
        const {result} = renderHook(() => useSwUpdate())

        await waitFor(() => expect(registerSW).toHaveBeenCalled())
        await act(async () => {
            await result.current.applyUpdate()
        })
        expect(update).toHaveBeenCalledWith(true)
    })

    it('dismiss resets needRefresh to false', async () => {
        let onNeedRefresh: (() => void) | undefined
        registerSW.mockImplementation((opts: {onNeedRefresh?: () => void}) => {
            onNeedRefresh = opts.onNeedRefresh
            return vi.fn().mockResolvedValue(undefined)
        })
        const {useSwUpdate} = await import('../useSwUpdate')
        const {result} = renderHook(() => useSwUpdate())

        afterLaunchWindow()
        act(() => onNeedRefresh?.())
        await waitFor(() => expect(result.current.needRefresh).toBe(true))
        act(() => result.current.dismiss())
        expect(result.current.needRefresh).toBe(false)
    })

    it('checks for a new worker when the app returns to the foreground and hourly', async () => {
        vi.useFakeTimers()
        try {
            const reg = {update: vi.fn().mockResolvedValue(undefined)}
            registerSW.mockImplementation((opts: {onRegisteredSW?: (u: string, r: unknown) => void}) => {
                opts.onRegisteredSW?.('/sw.js', reg)
                return vi.fn().mockResolvedValue(undefined)
            })
            const {useSwUpdate, UPDATE_CHECK_INTERVAL_MS} = await import('../useSwUpdate')
            renderHook(() => useSwUpdate())

            document.dispatchEvent(new Event('visibilitychange'))
            expect(reg.update).toHaveBeenCalledTimes(1)
            vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
            expect(reg.update).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
    })

    it('applies the update immediately when found right after launch, but shows the banner later', async () => {
        vi.useFakeTimers()
        try {
            let onNeedRefresh: (() => void) | undefined
            const update = vi.fn().mockResolvedValue(undefined)
            registerSW.mockImplementation((opts: {onNeedRefresh?: () => void}) => {
                onNeedRefresh = opts.onNeedRefresh
                return update
            })
            const {useSwUpdate, AUTO_APPLY_WINDOW_MS} = await import('../useSwUpdate')
            const {result} = renderHook(() => useSwUpdate())

            act(() => onNeedRefresh?.())
            expect(update).toHaveBeenCalledWith(true)
            expect(result.current.needRefresh).toBe(false)

            update.mockClear()
            vi.advanceTimersByTime(AUTO_APPLY_WINDOW_MS + 1)
            act(() => onNeedRefresh?.())
            expect(update).not.toHaveBeenCalled()
            expect(result.current.needRefresh).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })
})
