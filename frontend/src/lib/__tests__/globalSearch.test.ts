import {describe, expect, it} from 'vitest'
import {searchMembers, searchAccounts, searchEvenings, searchAnnouncements, searchTrips} from '../globalSearch'

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
        expect(r[0].hash).toBe('members?memberName=Hasi')
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
        expect(r[0].hash).toBe('treasury:accounts?member=1')
    })
})

describe('searchEvenings', () => {
    it('matches by venue', () => {
        const r = searchEvenings('nord', evenings)
        expect(r).toHaveLength(1)
        expect(r[0]).toMatchObject({kind: 'evening', id: 10, title: 'Kegelbahn Nord'})
        expect(r[0].hash).toBe('schedule?evening=10')
    })

    it('matches by date substring and falls back to date as title when venue is null', () => {
        const r = searchEvenings('2026-04', evenings)
        expect(r).toHaveLength(1)
        expect(r[0].title).toBe('2026-04-02')
        expect(r[0].subtitle).toBeUndefined()
    })

    it('returns [] for empty query', () => {
        expect(searchEvenings('', evenings)).toEqual([])
    })
})

describe('searchAnnouncements', () => {
    it('matches by title', () => {
        const r = searchAnnouncements('sommerfest', announcements)
        expect(r).toHaveLength(1)
        expect(r[0].hash).toBe('committee:announcements?item=20')
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
    it('matches by destination', () => {
        const r = searchTrips('rhein', trips)
        expect(r).toHaveLength(1)
        expect(r[0].hash).toBe('committee:trips?item=30')
        expect(r[0].subtitle).toBe('2026-06-01')
    })

    it('matches by note', () => {
        const r = searchTrips('bus', trips)
        expect(r).toHaveLength(1)
        expect(r[0].id).toBe(30)
    })

    it('does not throw when note is null', () => {
        expect(searchTrips('ostsee', trips)).toHaveLength(1)
    })
})
