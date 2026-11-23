import {describe, it, expect} from 'vitest'
import {
    nextAppointment,
    recentCommunity,
    formatNewsDate,
    balanceState,
    recentThrowAvgs,
    recentPenaltyEvenings,
    type MemberPenaltyRow,
} from '../dashboard'
import type {ClubAnnouncement, ClubTrip, ScheduledEvening, Sticker, ThrowStats} from '../../types'

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
        guest_requests_enabled: true,
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
    const ann = (
        id: number,
        title: string,
        created_at: string | null,
        text: string | null = null,
        extra: Partial<ClubAnnouncement> = {},
    ): ClubAnnouncement => ({
        id, title, text, media_url: null, created_by_name: null, created_at, ...extra,
    })
    const trip = (
        id: number,
        destination: string,
        created_at: string | null,
        note: string | null = null,
        extra: Partial<ClubTrip> = {},
    ): ClubTrip => ({
        id, date: '2026-09-01T10:00', end_date: null, destination, note, created_by_name: null, created_at, ...extra,
    })
    const sticker = (
        id: number,
        place: string,
        created_at: string | null,
        extra: Partial<Sticker> = {},
    ): Sticker => ({
        id, media_url: '', media_urls: [], place_name: place, latitude: 0, longitude: 0,
        caption: null, stuck_on: null, created_by_name: null, created_at, can_edit: false, ...extra,
    })

    it('merges announcements and trips newest-first', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-01T10:00'), ann(2, 'B', '2026-07-20T10:00')],
            [trip(3, 'Berlin', '2026-07-10T10:00')],
            [],
            5,
        )
        expect(out.map(i => i.id)).toEqual([2, 3, 1])
        expect(out[0].kind).toBe('announcement')
        expect(out[1].kind).toBe('trip')
    })

    it('uses updated_at over created_at for announcements and trips', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-01T10:00')],
            [trip(2, 'Berlin', '2026-06-01T10:00', null, {updated_at: '2026-07-15T10:00'})],
            [],
            5,
        )
        expect(out.map(i => [i.kind, i.id])).toEqual([['trip', 2], ['announcement', 1]])
        expect(out[0].date).toBe('2026-07-15T10:00')
    })

    it('caps the result at the given limit', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-01T10:00'), ann(2, 'B', '2026-07-02T10:00'), ann(3, 'C', '2026-07-03T10:00')],
            [],
            [],
            2,
        )
        expect(out).toHaveLength(2)
        expect(out.map(i => i.id)).toEqual([3, 2])
    })

    it('carries title/subtitle from the source items', () => {
        const out = recentCommunity([], [trip(9, 'Kegelfahrt Harz', '2026-07-05T10:00', 'Bus ab 8 Uhr')], [], 5)
        expect(out[0]).toMatchObject({title: 'Kegelfahrt Harz', subtitle: 'Bus ab 8 Uhr', kind: 'trip'})
    })

    it('orders stickers by stuck_on (EXIF date) rather than upload created_at', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-01T10:00')],
            [],
            [
                sticker(7, 'Hamburg', '2026-07-05T10:00', {stuck_on: '2026-06-15'}),
                sticker(8, 'Mallorca', '2026-07-06T10:00', {stuck_on: '2026-07-04'}),
            ],
            5,
        )
        expect(out.map(i => [i.kind, i.id])).toEqual([
            ['sticker', 8],
            ['announcement', 1],
            ['sticker', 7],
        ])
        expect(out[0].date).toBe('2026-07-04')
        expect(out[2].date).toBe('2026-06-15')
    })

    it('falls back to updated_at/created_at when a sticker has no stuck_on', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-02T10:00')],
            [],
            [sticker(7, 'Hamburg', '2026-07-01T10:00', {updated_at: '2026-07-05T10:00'})],
            5,
        )
        expect(out.map(i => [i.kind, i.id])).toEqual([['sticker', 7], ['announcement', 1]])
        expect(out[0].date).toBe('2026-07-05T10:00')
    })

    it('keeps created_at time-of-day when stuck_on matches the upload date and breaks ties', () => {
        const out = recentCommunity(
            [ann(1, 'Midday', '2026-07-10T12:00:00Z')],
            [],
            [
                sticker(2, 'Afternoon', '2026-07-10T15:00:00Z', {stuck_on: '2026-07-10'}),
                sticker(3, 'Earlier', '2026-07-12T08:00:00Z', {stuck_on: '2026-07-09'}),
                sticker(4, 'Earlier2', '2026-07-12T10:00:00Z', {stuck_on: '2026-07-09'}),
            ],
            5,
        )
        expect(out.map(i => i.id)).toEqual([2, 1, 4, 3])
    })

    it('bubbles posts with newer comment/reaction activity to the top and surfaces counts', () => {
        const out = recentCommunity(
            [
                ann(1, 'Quiet', '2026-07-10T10:00:00Z'),
                ann(2, 'Active', '2026-07-01T10:00:00Z', null, {
                    comment_count: 3,
                    reaction_count: 2,
                    last_activity_at: '2026-07-15T12:00:00Z',
                }),
            ],
            [],
            [
                sticker(3, 'Throwback', '2026-07-02T10:00:00Z', {
                    stuck_on: '2024-05-01',
                    reaction_count: 1,
                    last_activity_at: '2026-07-14T08:00:00Z',
                }),
            ],
            5,
        )
        expect(out.map(i => i.id)).toEqual([2, 3, 1])
        expect(out[0]).toMatchObject({
            commentCount: 3,
            reactionCount: 2,
            date: '2026-07-15T12:00:00Z',
            postDate: '2026-07-01T10:00:00Z',
        })
        expect(out[1]).toMatchObject({
            reactionCount: 1,
            date: '2026-07-14T08:00:00Z',
            postDate: '2024-05-01',
        })
    })

    it('filters by kind before applying the cap', () => {
        const out = recentCommunity(
            [ann(1, 'A', '2026-07-09T10:00'), ann(2, 'B', '2026-07-08T10:00')],
            [],
            [sticker(7, 'Hamburg', '2026-07-01T10:00')],
            1,
            'sticker',
        )
        expect(out.map(i => i.id)).toEqual([7])
    })

    it('treats a null created_at as oldest (ts 0)', () => {
        const out = recentCommunity([ann(1, 'A', null), ann(2, 'B', '2026-07-01T10:00')], [], [], 5)
        expect(out.map(i => i.id)).toEqual([2, 1])
    })

    it('includes documents and filters by kind "document"', () => {
        const doc = {
            id: 42,
            group_id: 'g1',
            title: 'Vereinssatzung 2026',
            document_type: 'satzung' as const,
            version: '2.0',
            decision_date: '2026-06-01',
            effective_date: null,
            summary: 'Neue Satzung',
            change_summary: 'Beitragsanpassung',
            file_name: 'satzung.pdf',
            file_size: 1024,
            uploaded_by_name: 'Admin',
            uploaded_at: '2026-07-10T12:00:00Z',
            is_current: true,
            acknowledged_count: 0,
            my_response: null,
            my_confirmed_at: null,
        }
        const out = recentCommunity([ann(1, 'A', '2026-07-01T10:00')], [], [], 5, undefined, [doc])
        expect(out.map(i => `${i.kind}:${i.id}`)).toEqual(['document:42', 'announcement:1'])
        expect(out[0].subtitle).toBe('Beitragsanpassung')

        const onlyDocs = recentCommunity([ann(1, 'A', '2026-07-01T10:00')], [], [], 5, 'document', [doc])
        expect(onlyDocs.map(i => `${i.kind}:${i.id}`)).toEqual(['document:42'])
    })
})

describe('formatNewsDate', () => {
    it('omits year for current-year dates and includes year for older dates', () => {
        expect(formatNewsDate('2026-07-15', 'de', 2026)).toMatch(/15\.\s*Jul/i)
        expect(formatNewsDate('2026-07-15', 'de', 2026)).not.toContain('2026')
        expect(formatNewsDate('2024-07-15', 'de', 2026)).toContain('2024')
        expect(formatNewsDate('2024-07-15', 'en', 2026)).toContain('2024')
    })

    it('returns empty string for null or invalid input', () => {
        expect(formatNewsDate(null, 'de', 2026)).toBe('')
        expect(formatNewsDate('not-a-date', 'de', 2026)).toBe('')
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

describe('recentPenaltyEvenings', () => {
    // `amount` defaults to 1 per row so evening totals are just the row count unless overridden.
    const p = (
        id: number,
        evening_date: string | null,
        created_at: string | null = null,
        amount = 1,
    ): MemberPenaltyRow => ({
        id, amount, icon: '🍺', penalty_type_name: `P${id}`, evening_date, created_at,
    })

    it('groups penalties by evening, newest evening first, and sums each evening total', () => {
        const out = recentPenaltyEvenings([
            p(1, '2026-07-05', '2026-07-05T20:00', 3),
            p(2, '2026-07-05', '2026-07-05T21:00', 2),
            p(3, '2026-07-20', '2026-07-20T20:00', 5),
        ], 5, 3)
        expect(out.map(g => g.key)).toEqual(['2026-07-20', '2026-07-05'])
        expect(out[0]).toMatchObject({total: 5, count: 1, more: 0})
        expect(out[1]).toMatchObject({total: 5, count: 2, more: 0})
    })

    it('folds penalties beyond itemsPerEvening into "more" while still summing all of them', () => {
        const rows = [1, 2, 3, 4].map(i => p(i, '2026-07-05', `2026-07-05T2${i}:00`, 2))
        const out = recentPenaltyEvenings(rows, 5, 2)
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({count: 4, total: 8, more: 2})
        expect(out[0].items).toHaveLength(2)
    })

    it('caps the number of evening groups returned', () => {
        const out = recentPenaltyEvenings([
            p(1, '2026-07-01'),
            p(2, '2026-07-10'),
            p(3, '2026-07-20'),
        ], 2, 3)
        expect(out.map(g => g.key)).toEqual(['2026-07-20', '2026-07-10'])
    })

    it('groups by created_at date when evening_date is missing', () => {
        const out = recentPenaltyEvenings([
            p(1, null, '2026-07-20T20:00'),
            p(2, null, '2026-07-05T20:00'),
        ], 5, 3)
        expect(out.map(g => g.key)).toEqual(['2026-07-20', '2026-07-05'])
        expect(out[0].date).toBe('2026-07-20T20:00')
    })

    it('orders the items within an evening newest first', () => {
        const out = recentPenaltyEvenings([
            p(1, '2026-07-05', '2026-07-05T20:00'),
            p(2, '2026-07-05', '2026-07-05T22:00'),
        ], 5, 3)
        expect(out[0].items.map(i => i.id)).toEqual([2, 1])
    })

    it('returns [] for an empty list', () => {
        expect(recentPenaltyEvenings([], 5, 3)).toEqual([])
    })
})
