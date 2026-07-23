import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Controllable fake router singleton — the adapters read/write this via useSyncExternalStore.
// vi.hoisted so the shared state is available inside the hoisted vi.mock factory.
const { state, listeners, setLocation } = vi.hoisted(() => {
    const state: { location: { pathname: string; search: Record<string, unknown>; searchStr: string } } = {
        location: { pathname: '/evening', search: {}, searchStr: '' },
    }
    const listeners = new Set<() => void>()
    const setLocation = (pathname: string, search: Record<string, unknown> = {}) => {
        const qs = new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString()
        state.location = { pathname, search, searchStr: qs ? `?${qs}` : '' }
        listeners.forEach((cb) => cb())
    }
    return { state, listeners, setLocation }
})

vi.mock('@/router', () => ({
    router: {
        state,
        subscribe: (_event: string, cb: () => void) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        },
        navigate: (opts: { to?: string; search?: unknown }) => {
            const pathname = opts.to ?? state.location.pathname
            const nextSearch =
                typeof opts.search === 'function'
                    ? (opts.search as (p: Record<string, unknown>) => Record<string, unknown>)(state.location.search)
                    : ((opts.search as Record<string, unknown>) ?? {})
            setLocation(pathname, nextSearch)
            return Promise.resolve()
        },
    },
}))

import { usePage, useHashTab, clearAuthParams } from '../usePage'

beforeEach(() => setLocation('/evening', {}))
afterEach(() => { listeners.clear() })

describe('usePage', () => {
    it('returns initial value when the path is not a nav page', () => {
        setLocation('/', {})
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        expect(result.current[0]).toBe('home')
    })

    it('reads the page from the current pathname', () => {
        setLocation('/evening', {})
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening', 'history']))
        expect(result.current[0]).toBe('evening')
    })

    it('falls back to initial when the page is not in navPages', () => {
        setLocation('/unknown', {})
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        expect(result.current[0]).toBe('home')
    })

    it('setPage navigates to the page path and updates reactively', () => {
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        act(() => { result.current[1]('evening') })
        expect(result.current[0]).toBe('evening')
        expect(state.location.pathname).toBe('/evening')
    })

    it('setPage is a no-op for a page outside navPages', () => {
        setLocation('/evening', {})
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        act(() => { result.current[1]('config' as string) })
        expect(state.location.pathname).toBe('/evening')
    })

    it('responds to router location changes', () => {
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        act(() => { setLocation('/evening', {}) })
        expect(result.current[0]).toBe('evening')
    })
})

describe('useHashTab', () => {
    it('returns initial value when no tab in search', () => {
        setLocation('/club', {})
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('general')
    })

    it('reads the sub-tab from the ?tab= search param', () => {
        setLocation('/club', { tab: 'members' })
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('members')
    })

    it('falls back to initial for an invalid sub-tab', () => {
        setLocation('/club', { tab: 'unknown' })
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('general')
    })

    it('setTab updates the ?tab= search param, keeping the page', () => {
        setLocation('/club', { tab: 'general' })
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        act(() => { result.current[1]('members') })
        expect(result.current[0]).toBe('members')
        expect(state.location.pathname).toBe('/club')
        expect(state.location.search.tab).toBe('members')
    })

    it('responds to router search changes', () => {
        setLocation('/club', { tab: 'general' })
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        act(() => { setLocation('/club', { tab: 'members' }) })
        expect(result.current[0]).toBe('members')
    })
})

describe('clearAuthParams', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('calls replaceState to remove search params when present', () => {
        const replaceState = vi.spyOn(window.history, 'replaceState')
        Object.defineProperty(window, 'location', {
            value: { search: '?token=abc', pathname: '/app', hash: '' },
            configurable: true,
        })
        clearAuthParams()
        expect(replaceState).toHaveBeenCalledWith({}, '', '/app')
    })

    it('does nothing when no search params', () => {
        const replaceState = vi.spyOn(window.history, 'replaceState')
        Object.defineProperty(window, 'location', {
            value: { search: '', pathname: '/app', hash: '' },
            configurable: true,
        })
        clearAuthParams()
        expect(replaceState).not.toHaveBeenCalled()
    })
})
