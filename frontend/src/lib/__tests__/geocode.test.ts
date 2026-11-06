import {afterEach, describe, expect, it, vi} from 'vitest'
import {placeLabel, reverseGeocode} from '../geocode'

describe('placeLabel', () => {
    it('joins city and country', () => {
        expect(placeLabel({city: 'Rom', country: 'Italien'})).toBe('Rom, Italien')
    })
    it('falls back to smaller/larger units', () => {
        expect(placeLabel({village: 'Deià', country: 'Spanien'})).toBe('Deià, Spanien')
        expect(placeLabel({state: 'Tirol', country: 'Österreich'})).toBe('Tirol, Österreich')
    })
    it('works with the country alone and returns null for nothing', () => {
        expect(placeLabel({country: 'Island'})).toBe('Island')
        expect(placeLabel({})).toBeNull()
        expect(placeLabel(undefined)).toBeNull()
    })
})

describe('reverseGeocode', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('requests the locale and returns the label', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({address: {city: 'Rome', country: 'Italy'}})})
        vi.stubGlobal('fetch', fetchMock)
        expect(await reverseGeocode(41.9, 12.5, 'en')).toBe('Rome, Italy')
        const url = String(fetchMock.mock.calls[0][0])
        expect(url).toContain('accept-language=en')
        expect(url).toContain('lat=41.90000')
    })

    it('returns null on HTTP errors and network failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false}))
        expect(await reverseGeocode(1, 1, 'de')).toBeNull()
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        expect(await reverseGeocode(1, 1, 'de')).toBeNull()
    })
})
