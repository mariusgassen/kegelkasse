import {describe, it, expect} from 'vitest'
import {
    nextAppointment,
    recentCommunity,
    balanceState,
    recentThrowAvgs,
    recentPenalties,
    type MemberPenaltyRow,
} from '../dashboard'
import type {ClubAnnouncement, ClubTrip, ScheduledEvening, ThrowStats} from '../../types'

function se(id: number, scheduled_at: string, evening_id: number | null = null): ScheduledEvening {
    return {
        id,
        scheduled_at,
        venue: null,
        note: null,
        created_at: null,
        attending_count: 0,
        absent_count: 0,
        my_rsvp: null,
        guests: [],
        evening_id,
    }
}

describe('nextAppointment', () => {
    it('returns the earliest upcoming, not-yet-started evening', () => {
        const list = [
            se(1, '2026-08-10T20:00'),
            se(2, '2026-07-25T20:00'),
            se(3, '2026-09-01T20:00'),
        ]
        expect(nextAppointment(list, '2026-07-23')?.id).toBe(2)
    })

    it('includes an evening later today', () => {
        const list = [se(1, '2026-07-23T20:00')]
        expect(nextAppointment(list, '2026-07-23')?.id).toBe(1)
    })

    it('excludes past evenings', () => {
        const list = [se(1, '2026-07-20T20:00')]
        expect(nextAppointment(list, '2026-07-23')).toBeNull()
    })

    it('excludes evenings that have already been started', () => {
        const list = [se(1, '2026-07-25T20:00', 42)]
        expect(nextAppointment(list, '2026-07-23')).toBeNull()
    })

    it('returns null for an empty list', () => {
        expect(nextAppointment([], '2026-07-23')).toBeNull()
    })
})

describe('recentCommunity', () => {
    const ann = (id: number, title: string, created_at: string | null, text: string | null = null): ClubAnnouncement => ({
        id, title, text, media_url: null, created_by_name: null, created_at,
    })
    const trip = (id: number, destination: string, created_at: string | null, note: string | null = null): ClubTrip => ({
        id, date: '2026-09-01T10:00', destination, note, created_by_name: null, created_at,
    })

    it('merges announcements and trips newest-first', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-01T10:00'), ann(2, 'B', '2026-07-20T10:00')],
            [trip(3, 'Berlin', '2026-07-10T10:00')],
            5,
        )
        expect(out.map(i => i.id)).toEqual([2, 3, 1])
        expect(out[0].kind).toBe('announcement')
        expect(out[1].kind).toBe('trip')
    })

    it('caps the result at the given limit', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-01T10:00'), ann(2, 'B', '2026-07-02T10:00'), ann(3, 'C', '2026-07-03T10:00')],
            [],
            2,
        )
        expect(out).toHaveLength(2)
        expect(out.map(i => i.id)).toEqual([3, 2])
    })

    it('carries title/subtitle from the source items', () => {
        const out = recentCommunity([], [trip(9, 'Kegelfahrt Harz', '2026-07-05T10:00', 'Bus ab 8 Uhr')], 5)
        expect(out[0]).toMatchObject({title: 'Kegelfahrt Harz', subtitle: 'Bus ab 8 Uhr', kind: 'trip'})
    })

    it('treats a null created_at as oldest (ts 0)', () => {
        const out = recentCommunity([ann(1, 'A', null), ann(2, 'B', '2026-07-01T10:00')], [], 5)
        expect(out.map(i => i.id)).toEqual([2, 1])
    })
})

describe('balanceState', () => {
    it('classifies debt, credit and settled', () => {
        expect(balanceState(-5)).toBe('owed')
        expect(balanceState(5)).toBe('credit')
        expect(balanceState(0)).toBe('settled')
    })

    it('treats sub-cent noise as settled', () => {
        expect(balanceState(-0.005)).toBe('settled')
        expect(balanceState(0.005)).toBe('settled')
    })

    it('treats null/undefined as settled', () => {
        expect(balanceState(null)).toBe('settled')
        expect(balanceState(undefined)).toBe('settled')
    })
})

describe('recentThrowAvgs', () => {
    const stats = (evenings: {date: string; avg_pins: number}[]): ThrowStats => ({
        regular_member_id: 1,
        year: 2026,
        total_pins: 0,
        throw_count: 0,
        avg_pins: null,
        best_avg: null,
        worst_avg: null,
        evenings: evenings.map(e => ({
            evening_id: 0, date: e.date, location: null, total_pins: 0, throw_count: 0, avg_pins: e.avg_pins,
        })),
    })

    it('returns per-evening averages oldest→newest', () => {
        const out = recentThrowAvgs(stats([
            {date: '2026-03-01', avg_pins: 5},
            {date: '2026-01-01', avg_pins: 3},
            {date: '2026-02-01', avg_pins: 4},
        ]), 10)
        expect(out).toEqual([3, 4, 5])
    })

    it('keeps only the last N evenings', () => {
        const out = recentThrowAvgs(stats([
            {date: '2026-01-01', avg_pins: 1},
            {date: '2026-02-01', avg_pins: 2},
            {date: '2026-03-01', avg_pins: 3},
        ]), 2)
        expect(out).toEqual([2, 3])
    })

    it('returns [] when there is no throw data', () => {
        expect(recentThrowAvgs(undefined, 5)).toEqual([])
        expect(recentThrowAvgs(null, 5)).toEqual([])
        expect(recentThrowAvgs(stats([]), 5)).toEqual([])
    })
})

describe('recentPenalties', () => {
    const p = (id: number, created_at: string | null, evening_date: string | null = null): MemberPenaltyRow => ({
        id, amount: id, icon: '🍺', penalty_type_name: `P${id}`, evening_date, created_at,
    })

    it('orders by log time, newest first, and maps the display fields', () => {
        const out = recentPenalties([
            p(1, '2026-07-01T20:00'),
            p(3, '2026-07-20T20:00'),
            p(2, '2026-07-10T20:00'),
        ], 5)
        expect(out.map(r => r.id)).toEqual([3, 2, 1])
        expect(out[0]).toMatchObject({id: 3, icon: '🍺', name: 'P3', amount: 3, date: '2026-07-20T20:00'})
    })

    it('caps the result at the given limit', () => {
        const out = recentPenalties([
            p(1, '2026-07-01T20:00'),
            p(2, '2026-07-02T20:00'),
            p(3, '2026-07-03T20:00'),
        ], 2)
        expect(out.map(r => r.id)).toEqual([3, 2])
    })

    it('falls back to the evening date for ordering and display when created_at is null', () => {
        const out = recentPenalties([
            p(1, null, '2026-07-20'),
            p(2, null, '2026-07-05'),
        ], 5)
        expect(out.map(r => r.id)).toEqual([1, 2])
        expect(out[0].date).toBe('2026-07-20')
    })

    it('returns [] for an empty list', () => {
        expect(recentPenalties([], 5)).toEqual([])
    })
})
