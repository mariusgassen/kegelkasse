import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getHashParams, clearHashParams } from '../hashParams'

describe('getHashParams', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('returns empty URLSearchParams when hash has no query string', () => {
        vi.stubGlobal('window', {
            location: { hash: '#schedule', pathname: '/app' },
        })
        const params = getHashParams()
        expect(params.toString()).toBe('')
    })

    it('returns params from hash query string', () => {
        vi.stubGlobal('window', {
            location: { hash: '#schedule?event=5', pathname: '/app' },
        })
        const params = getHashParams()
        expect(params.get('event')).toBe('5')
    })

    it('handles multiple params', () => {
        vi.stubGlobal('window', {
            location: { hash: '#schedule?event=5&item=3', pathname: '/app' },
        })
        const params = getHashParams()
        expect(params.get('event')).toBe('5')
        expect(params.get('item')).toBe('3')
    })

    it('returns empty params when hash is empty', () => {
        vi.stubGlobal('window', {
            location: { hash: '', pathname: '/app' },
        })
        const params = getHashParams()
        expect(params.toString()).toBe('')
    })
})

describe('clearHashParams', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('strips query params and keeps the base hash', () => {
        const replaceState = vi.fn()
        vi.stubGlobal('window', {
            location: { hash: '#schedule?event=5', pathname: '/app' },
        })
        vi.stubGlobal('history', { replaceState })
        clearHashParams()
        expect(replaceState).toHaveBeenCalledWith({}, '', '/app#schedule')
    })

    it('works when hash has no query params', () => {
        const replaceState = vi.fn()
        vi.stubGlobal('window', {
            location: { hash: '#schedule', pathname: '/app' },
        })
        vi.stubGlobal('history', { replaceState })
        clearHashParams()
        expect(replaceState).toHaveBeenCalledWith({}, '', '/app#schedule')
    })
})
