import { describe, it, expect, beforeEach, vi } from 'vitest'

// Controllable fake router singleton (see usePage.test for the same pattern).
const { state, nav, setLocation } = vi.hoisted(() => {
    const state: { location: { pathname: string; search: Record<string, unknown>; searchStr: string } } = {
        location: { pathname: '/schedule', search: {}, searchStr: '' },
    }
    const nav: { last: { to?: string; search?: unknown; replace?: boolean } | null } = { last: null }
    const setLocation = (pathname: string, search: Record<string, unknown> = {}) => {
        const qs = new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString()
        state.location = { pathname, search, searchStr: qs ? `?${qs}` : '' }
    }
    return { state, nav, setLocation }
})

vi.mock('@/router', () => ({
    router: {
        state,
        navigate: (opts: { to?: string; search?: unknown; replace?: boolean }) => {
            nav.last = opts
            return Promise.resolve()
        },
    },
}))

import { getHashParams, clearHashParams } from '../hashParams'

beforeEach(() => {
    nav.last = null
    setLocation('/schedule', {})
})

describe('getHashParams', () => {
    it('returns empty params when the router search is empty', () => {
        setLocation('/schedule', {})
        expect(getHashParams().toString()).toBe('')
    })

    it('returns params from the router search', () => {
        setLocation('/schedule', { event: '5' })
        expect(getHashParams().get('event')).toBe('5')
    })

    it('handles multiple params (numbers coerced to strings)', () => {
        setLocation('/schedule', { event: 5, item: 3 })
        const params = getHashParams()
        expect(params.get('event')).toBe('5')
        expect(params.get('item')).toBe('3')
    })
})

describe('clearHashParams', () => {
    it('navigates to strip deep-link params while keeping the active tab', () => {
        setLocation('/treasury', { tab: 'accounts', member: '5' })
        clearHashParams()
        expect(nav.last).toMatchObject({ to: '/treasury', replace: true })
        // The search resolver keeps only `tab`.
        const resolver = nav.last!.search as (p: Record<string, unknown>) => Record<string, unknown>
        expect(resolver({ tab: 'accounts', member: '5' })).toEqual({ tab: 'accounts' })
    })

    it('navigates to an empty search when there is no tab', () => {
        setLocation('/schedule', { event: '5' })
        clearHashParams()
        const resolver = nav.last!.search as (p: Record<string, unknown>) => Record<string, unknown>
        expect(resolver({ event: '5' })).toEqual({})
    })
})
