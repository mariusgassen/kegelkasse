import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

const navigate = vi.fn(() => Promise.resolve())
vi.mock('@/router', () => ({router: {navigate: (...a: unknown[]) => navigate(...(a as []))}}))

import {followAiLink, OPEN_PROFILE_EVENT} from '../aiLinks'

describe('followAiLink', () => {
    beforeEach(() => navigate.mockClear())
    afterEach(() => vi.restoreAllMocks())

    it('navigates the router for app links', () => {
        expect(followAiLink({href: 'app:treasury.accounts', label: 'Konten', kind: 'app', to: '/treasury', search: {tab: 'accounts'}})).toBe(true)
        expect(navigate).toHaveBeenCalledWith({to: '/treasury', search: {tab: 'accounts'}})
    })

    it('opens the profile sheet via a window event', () => {
        const seen: unknown[] = []
        const h = (e: Event) => seen.push((e as CustomEvent).detail)
        window.addEventListener(OPEN_PROFILE_EVENT, h)
        expect(followAiLink({href: 'app:profile.settings', label: 'P', kind: 'profile', tab: 'settings'})).toBe(true)
        window.removeEventListener(OPEN_PROFILE_EVENT, h)
        expect(seen).toEqual([{tab: 'settings'}])
        expect(navigate).not.toHaveBeenCalled()
    })

    it('opens docs in a new tab and keeps the app where it is', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        expect(followAiLink({href: 'docs:funktionen/push', label: 'Doku', kind: 'docs', url: '/docs/funktionen/push'})).toBe(false)
        expect(open).toHaveBeenCalledWith('/docs/funktionen/push', '_blank', 'noopener')
        expect(navigate).not.toHaveBeenCalled()
    })
})
