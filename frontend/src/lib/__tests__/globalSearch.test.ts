import {describe, expect, it} from 'vitest'
import {
    searchMembers,
    searchAccounts,
    searchEvenings,
    searchAnnouncements,
    searchTrips,
    searchBookings,
    formatSearchDate,
} from '../globalSearch'

const members = [
    {id: 1, name: 'Hans Müller', nickname: 'Hasi'},
    {id: 2, name: 'Peter Schmidt', nickname: null},
    {id: 3, name: 'Anna Weber', nickname: 'Anni'},
]

const evenings = [
    {id: 10, date: '2026-03-15', venue: 'Kegelbahn Nord'},
    {id: 11, date: '2026-04-02', venue: null},
]

const announcements = [
    {id: 20, title: 'Sommerfest 2026', text: 'Details folgen'},
    {id: 21, title: 'Neue Bahnzeiten', text: null},
]

const trips = [
    {id: 30, destination: 'Kegelfahrt Rhein', date: '2026-06-01', note: 'Bus ab 8 Uhr'},
    {id: 31, destination: 'Ausflug Ostsee', date: '2026-08-10', note: null},
]

const payments = [
    {id: 100, member_name: 'Hans Müller', amount: 20, note: 'Eintrittsbeitrag', date: '2026-03-01', created_at: null},
    {id: 101, member_name: 'Peter Schmidt', amount: -15, note: null, date: null, created_at: '2026-05-10T18:00:00Z'},
]

const expenses = [
    {id: 200, description: 'Kegelbahn Miete', amount: 80, date: '2026-03-05', created_at: null},
    {id: 201, description: 'Getränke Nachschub', amount: 40, date: null, created_at: '2026-07-01T10:00:00Z'},
]

describe('searchMembers', () => {
    it('returns [] for an empty/blank query', () => {
        expect(searchMembers('', members)).toEqual([])
        expect(searchMembers('   ', members)).toEqual([])
    })

    it('matches by nickname (case-insensitive)', () => {
        const r = searchMembers('hasi', members)
        expect(r).toHaveLength(1)
        expect(r[0]).toMatchObject({kind: 'member', id: 1, title: 'Hasi'})
    })

    it('matches by full name when no nickname matches', () => {
        const r = searchMembers('schmidt', members)
        expect(r).toHaveLength(1)
        expect(r[0].title).toBe('Peter Schmidt')
    })

    it('prefers the nickname as the display title when both exist', () => {
        const r = searchMembers('anna', members)
        expect(r[0].title).toBe('Anni')
    })

    it('builds a members-page deep-link hash', () => {
        const r = searchMembers('hasi', members)
        expect(r[0].nav).toEqual({to: '/members', search: {memberName: 'Hasi'}})
    })

    it('caps results at 5', () => {
        const many = Array.from({length: 8}, (_, i) => ({id: i, name: `Foo ${i}`, nickname: null}))
        expect(searchMembers('foo', many)).toHaveLength(5)
    })
})

describe('searchAccounts', () => {
    it('targets the treasury accounts deep-link', () => {
        const r = searchAccounts('hasi', members)
        expect(r[0]).toMatchObject({kind: 'account', id: 1, title: 'Hasi'})
        expect(r[0].nav).toEqual({to: '/treasury', search: {tab: 'accounts', member: 1}})
    })
})

describe('formatSearchDate', () => {
    it('formats a date-only string in German', () => {
        expect(formatSearchDate('2026-03-15', 'de')).toBe('15. März 2026')
    })

    it('formats a date-only string in English', () => {
        expect(formatSearchDate('2026-03-15', 'en')).toBe('March 15, 2026')
    })

    it('returns undefined for null/empty input', () => {
        expect(formatSearchDate(null, 'de')).toBeUndefined()
        expect(formatSearchDate(undefined, 'de')).toBeUndefined()
    })

    it('anchors date-only strings to local midnight (no day-shift)', () => {
        // If this were parsed as UTC midnight, a negative-UTC-offset timezone could roll it back a day.
        expect(formatSearchDate('2026-01-01', 'en')).toBe('January 01, 2026')
    })
})

describe('searchEvenings', () => {
    it('matches by venue', () => {
        const r = searchEvenings('nord', evenings, 'de')
        expect(r).toHaveLength(1)
        expect(r[0]).toMatchObject({kind: 'evening', id: 10, title: 'Kegelbahn Nord'})
        expect(r[0].nav).toEqual({to: '/schedule', search: {evening: 10}})
        expect(r[0].subtitle).toBe('15. März 2026')
    })

    it('matches by raw date substring and falls back to the formatted date as title when venue is null', () => {
        const r = searchEvenings('2026-04', evenings, 'de')
        expect(r).toHaveLength(1)
        expect(r[0].title).toBe('02. April 2026')
        expect(r[0].subtitle).toBeUndefined()
    })

    it('matches the written-out month name in the given locale', () => {
        expect(searchEvenings('märz', evenings, 'de')).toHaveLength(1)
        expect(searchEvenings('march', evenings, 'en')).toHaveLength(1)
        // German query does not match in English mode and vice versa
        expect(searchEvenings('märz', evenings, 'en')).toHaveLength(0)
    })

    it('returns [] for empty query', () => {
        expect(searchEvenings('', evenings, 'de')).toEqual([])
    })
})

describe('searchAnnouncements', () => {
    it('matches by title', () => {
        const r = searchAnnouncements('sommerfest', announcements)
        expect(r).toHaveLength(1)
        expect(r[0].nav).toEqual({to: '/committee', search: {tab: 'announcements', item: 20}})
    })

    it('matches by text body', () => {
        const r = searchAnnouncements('folgen', announcements)
        expect(r).toHaveLength(1)
        expect(r[0].id).toBe(20)
    })

    it('does not throw when text is null', () => {
        expect(() => searchAnnouncements('bahnzeiten', announcements)).not.toThrow()
        expect(searchAnnouncements('bahnzeiten', announcements)).toHaveLength(1)
    })
})

describe('searchTrips', () => {
    it('matches by destination and shows a formatted date subtitle', () => {
        const r = searchTrips('rhein', trips, 'de')
        expect(r).toHaveLength(1)
        expect(r[0].nav).toEqual({to: '/committee', search: {tab: 'trips', item: 30}})
        expect(r[0].subtitle).toBe('01. Juni 2026')
    })

    it('matches by note', () => {
        const r = searchTrips('bus', trips, 'de')
        expect(r).toHaveLength(1)
        expect(r[0].id).toBe(30)
    })

    it('matches the written-out month name', () => {
        expect(searchTrips('august', trips, 'en')).toHaveLength(1)
    })

    it('does not throw when note is null', () => {
        expect(searchTrips('ostsee', trips, 'de')).toHaveLength(1)
    })
})

describe('searchBookings', () => {
    it('matches a payment by member name', () => {
        const r = searchBookings('hans', payments, [], 'de')
        expect(r).toHaveLength(1)
        expect(r[0]).toMatchObject({kind: 'payment', id: 100, title: 'Eintrittsbeitrag'})
        expect(r[0].nav).toEqual({to: '/treasury', search: {tab: 'bookings', q: 'Eintrittsbeitrag'}})
        expect(r[0].subtitle).toContain('Hans Müller')
    })

    it('matches a payment by note', () => {
        const r = searchBookings('eintrittsbeitrag', payments, [], 'de')
        expect(r).toHaveLength(1)
        expect(r[0].id).toBe(100)
    })

    it('falls back to the member name as title when a payment has no note', () => {
        const r = searchBookings('peter', payments, [], 'de')
        expect(r[0].title).toBe('Peter Schmidt')
    })

    it('matches an expense by description', () => {
        const r = searchBookings('miete', [], expenses, 'de')
        expect(r).toHaveLength(1)
        expect(r[0]).toMatchObject({kind: 'expense', id: 200, title: 'Kegelbahn Miete'})
        expect(r[0].nav).toEqual({to: '/treasury', search: {tab: 'bookings', q: 'Kegelbahn Miete'}})
    })

    it('matches by written-out month across both payments and expenses', () => {
        const r = searchBookings('märz', payments, expenses, 'de')
        expect(r.map(x => x.id).sort()).toEqual([100, 200])
    })

    it('falls back to created_at when date is null', () => {
        const r = searchBookings('juli', [], expenses, 'de')
        expect(r).toHaveLength(1)
        expect(r[0].id).toBe(201)
    })

    it('keeps payment and expense ids distinguishable via kind (no key collisions)', () => {
        const clashingExpenses = [{id: 100, description: 'Zufällig gleiche ID', amount: 5, date: '2026-03-01', created_at: null}]
        const r = searchBookings('2026', payments, clashingExpenses, 'de')
        const keys = r.map(x => `${x.kind}-${x.id}`)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('caps combined results at 5', () => {
        const manyPayments = Array.from({length: 4}, (_, i) => ({id: i, member_name: `Foo ${i}`, amount: 1, note: 'foo', date: '2026-01-01', created_at: null}))
        const manyExpenses = Array.from({length: 4}, (_, i) => ({id: i, description: 'foo', amount: 1, date: '2026-01-01', created_at: null}))
        expect(searchBookings('foo', manyPayments, manyExpenses, 'de')).toHaveLength(5)
    })

    it('returns [] for empty query', () => {
        expect(searchBookings('', payments, expenses, 'de')).toEqual([])
    })
})
