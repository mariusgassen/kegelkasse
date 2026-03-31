import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePage, useHashTab, clearAuthParams } from '../usePage'

describe('usePage', () => {
    beforeEach(() => {
        window.location.hash = ''
    })

    afterEach(() => {
        window.location.hash = ''
    })

    it('returns initial value when hash is empty', () => {
        const { result } = renderHook(() => usePage('home'))
        expect(result.current[0]).toBe('home')
    })

    it('reads page from current hash', () => {
        window.location.hash = '#evening'
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening', 'history']))
        expect(result.current[0]).toBe('evening')
    })

    it('falls back to initial when hash is not in navPages', () => {
        window.location.hash = '#unknown'
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        expect(result.current[0]).toBe('home')
    })

    it('setPage updates state and hash', () => {
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        act(() => {
            result.current[1]('evening')
        })
        expect(result.current[0]).toBe('evening')
        expect(window.location.hash).toBe('#evening')
    })

    it('setPage updates state without touching hash for non-navPage', () => {
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        act(() => {
            result.current[1]('config' as string)
        })
        expect(result.current[0]).toBe('config')
    })

    it('responds to hashchange events', () => {
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        act(() => {
            window.location.hash = '#evening'
            window.dispatchEvent(new Event('hashchange'))
        })
        expect(result.current[0]).toBe('evening')
    })

    it('strips sub-tab from hash when reading page', () => {
        window.location.hash = '#evening:games'
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        expect(result.current[0]).toBe('evening')
    })

    it('strips query params from hash when reading page', () => {
        window.location.hash = '#evening?foo=bar'
        const { result } = renderHook(() => usePage<string>('home', ['home', 'evening']))
        expect(result.current[0]).toBe('evening')
    })
})

describe('useHashTab', () => {
    beforeEach(() => {
        window.location.hash = ''
    })

    afterEach(() => {
        window.location.hash = ''
    })

    it('returns initial value when no sub-tab in hash', () => {
        window.location.hash = '#club'
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('general')
    })

    it('reads sub-tab from hash', () => {
        window.location.hash = '#club:members'
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('members')
    })

    it('falls back to initial for invalid sub-tab', () => {
        window.location.hash = '#club:unknown'
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('general')
    })

    it('setTab updates hash preserving main page', () => {
        window.location.hash = '#club:general'
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        act(() => {
            result.current[1]('members')
        })
        expect(result.current[0]).toBe('members')
        expect(window.location.hash).toBe('#club:members')
    })

    it('responds to hashchange', () => {
        window.location.hash = '#club:general'
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        act(() => {
            window.location.hash = '#club:members'
            window.dispatchEvent(new Event('hashchange'))
        })
        expect(result.current[0]).toBe('members')
    })

    it('strips query params from sub-tab', () => {
        window.location.hash = '#club:members?foo=bar'
        const { result } = renderHook(() => useHashTab<string>('general', ['general', 'members']))
        expect(result.current[0]).toBe('members')
    })
})

describe('clearAuthParams', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

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
