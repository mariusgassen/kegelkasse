import { describe, it, expect } from 'vitest'
import { legacyHashToLocation, locationToPath, ROUTE_PAGES } from '../legacyHash'

describe('legacyHashToLocation', () => {
    it('maps a bare page hash to its path', () => {
        expect(legacyHashToLocation('#evening')).toEqual({ pathname: '/evening', search: {} })
    })

    it('maps a page:subtab hash to a ?tab= search param', () => {
        expect(legacyHashToLocation('#evening:manage')).toEqual({
            pathname: '/evening',
            search: { tab: 'manage' },
        })
    })

    it('maps a subtab + query hash (member deep link)', () => {
        expect(legacyHashToLocation('#treasury:accounts?member=5')).toEqual({
            pathname: '/treasury',
            search: { tab: 'accounts', member: '5' },
        })
    })

    it('maps a committee trip item deep link', () => {
        expect(legacyHashToLocation('#committee:trips?item=5')).toEqual({
            pathname: '/committee',
            search: { tab: 'trips', item: '5' },
        })
    })

    it('maps a plain page + query hash (schedule evening)', () => {
        expect(legacyHashToLocation('#schedule?evening=7')).toEqual({
            pathname: '/schedule',
            search: { evening: '7' },
        })
    })

    it('maps a bookings query deep link', () => {
        expect(legacyHashToLocation('#treasury:bookings?q=foo%20bar')).toEqual({
            pathname: '/treasury',
            search: { tab: 'bookings', q: 'foo bar' },
        })
    })

    it('accepts a hash without the leading # and with a leading slash', () => {
        expect(legacyHashToLocation('members?memberName=Max')).toEqual({
            pathname: '/members',
            search: { memberName: 'Max' },
        })
        expect(legacyHashToLocation('#/stats')).toEqual({ pathname: '/stats', search: {} })
    })

    it('carries notification rid params through', () => {
        expect(legacyHashToLocation('#treasury:accounts?rid=9')).toEqual({
            pathname: '/treasury',
            search: { tab: 'accounts', rid: '9' },
        })
    })

    it('returns null for empty or unknown pages', () => {
        expect(legacyHashToLocation('')).toBeNull()
        expect(legacyHashToLocation('#')).toBeNull()
        expect(legacyHashToLocation('#nonsense')).toBeNull()
        expect(legacyHashToLocation('#profile:settings')).toBeNull()
    })

    it('covers every route page', () => {
        for (const page of ROUTE_PAGES) {
            expect(legacyHashToLocation(`#${page}`)).toEqual({ pathname: `/${page}`, search: {} })
        }
    })
})

describe('locationToPath', () => {
    it('serialises a bare path', () => {
        expect(locationToPath({ pathname: '/evening', search: {} })).toBe('/evening')
    })

    it('serialises path + search', () => {
        expect(locationToPath({ pathname: '/treasury', search: { tab: 'accounts', member: '5' } }))
            .toBe('/treasury?tab=accounts&member=5')
    })

    it('round-trips with legacyHashToLocation', () => {
        const loc = legacyHashToLocation('#committee:announcements?item=3')!
        expect(locationToPath(loc)).toBe('/committee?tab=announcements&item=3')
    })
})
