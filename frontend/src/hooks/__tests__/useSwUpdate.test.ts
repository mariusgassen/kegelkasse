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
    })

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

        act(() => onNeedRefresh?.())
        await waitFor(() => expect(result.current.needRefresh).toBe(true))
        act(() => result.current.dismiss())
        expect(result.current.needRefresh).toBe(false)
    })
})
