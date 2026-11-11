import {afterEach, describe, expect, it, vi} from 'vitest'
import {clearGeocodeCache, placeLabel, reverseGeocode} from '../geocode'

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
    afterEach(() => {
        clearGeocodeCache()
        vi.unstubAllGlobals()
    })

    it('requests the locale, caches nearby coordinates and returns the label', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({address: {city: 'Rome', country: 'Italy'}})})
        vi.stubGlobal('fetch', fetchMock)
        expect(await reverseGeocode(41.9, 12.5, 'en')).toBe('Rome, Italy')
        expect(await reverseGeocode(41.9001, 12.5002, 'en')).toBe('Rome, Italy')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const url = String(fetchMock.mock.calls[0][0])
        expect(url).toContain('accept-language=en')
        expect(url).toContain('lat=41.90000')
    })

    it('serializes bursts of >5 lookups without dropping any', async () => {
        let inFlight = 0
        let maxInFlight = 0
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise(r => setTimeout(r, 2))
            inFlight--
            const m = /lat=([0-9.]+)/.exec(url)
            return {ok: true, json: async () => ({address: {city: `City-${m?.[1]}`, country: 'DE'}})}
        })
        vi.stubGlobal('fetch', fetchMock)
        const results = await Promise.all(
            Array.from({length: 7}, (_, i) => reverseGeocode(50 + i, 8 + i, 'de'))
        )
        expect(results).toHaveLength(7)
        expect(results.every(r => r?.startsWith('City-'))).toBe(true)
        expect(maxInFlight).toBe(1)
    })

    it('returns null on HTTP errors and network failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false}))
        expect(await reverseGeocode(1, 1, 'de')).toBeNull()
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        expect(await reverseGeocode(2, 2, 'de')).toBeNull()
    })
})
