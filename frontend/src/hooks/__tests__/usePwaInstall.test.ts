import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest'
import {renderHook, act, waitFor} from '@testing-library/react'
import {usePwaInstall} from '../usePwaInstall'

function stubMatchMedia(standalone: boolean) {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
        matches: standalone,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }))
}

function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {value: ua, configurable: true})
}

describe('usePwaInstall', () => {
    beforeEach(() => {
        stubMatchMedia(false)
        setUserAgent('Mozilla/5.0 (Linux; Android 13)')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('detects iOS from the user agent', () => {
        setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
        const {result} = renderHook(() => usePwaInstall())
        expect(result.current.isIos).toBe(true)
    })

    it('does not flag iOS on Android', () => {
        const {result} = renderHook(() => usePwaInstall())
        expect(result.current.isIos).toBe(false)
    })

    it('detects standalone display mode', () => {
        stubMatchMedia(true)
        const {result} = renderHook(() => usePwaInstall())
        expect(result.current.isStandalone).toBe(true)
    })

    it('captures beforeinstallprompt and resolves the user choice', async () => {
        const {result} = renderHook(() => usePwaInstall())
        expect(result.current.canInstall).toBe(false)

        const userChoice = Promise.resolve({outcome: 'accepted' as const, platform: 'web'})
        const evt = Object.assign(new Event('beforeinstallprompt'), {
            platforms: ['web'],
            userChoice,
            prompt: vi.fn().mockResolvedValue(undefined),
        })

        act(() => {
            window.dispatchEvent(evt)
        })

        await waitFor(() => expect(result.current.canInstall).toBe(true))

        let outcome: string | undefined
        await act(async () => {
            outcome = await result.current.promptInstall()
        })
        expect(evt.prompt).toHaveBeenCalled()
        expect(outcome).toBe('accepted')
        await waitFor(() => expect(result.current.canInstall).toBe(false))
    })

    it('returns "unavailable" when no install event was captured', async () => {
        const {result} = renderHook(() => usePwaInstall())
        let outcome: string | undefined
        await act(async () => {
            outcome = await result.current.promptInstall()
        })
        expect(outcome).toBe('unavailable')
    })
})
