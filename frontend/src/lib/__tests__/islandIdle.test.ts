import {describe, it, expect} from 'vitest'
import {
    daysUntilDate,
    deriveIdleIslandMode,
    formatEurCompact,
    formatEurFull,
    formatScheduleCompact,
    formatScheduleFull,
    todayLocalKey,
} from '../islandIdle'
import type {ScheduledEvening} from '../../types'

function se(overrides: Partial<ScheduledEvening> = {}): ScheduledEvening {
    return {
        id: 1,
        scheduled_at: '2026-11-20T19:30',
        venue: 'Gasthaus Krone',
        note: null,
        created_at: null,
        attending_count: 6,
        absent_count: 1,
        my_rsvp: null,
        guests: [],
        evening_id: null,
        guest_requests_enabled: true,
        ...overrides,
    }
}

describe('todayLocalKey', () => {
    it('formats local YYYY-MM-DD', () => {
        expect(todayLocalKey(new Date(2026, 10, 4, 23, 55))).toBe('2026-11-04')
    })
})

describe('daysUntilDate', () => {
    it('computes calendar day offsets', () => {
        expect(daysUntilDate('2026-11-14T20:00', '2026-11-14')).toBe(0)
        expect(daysUntilDate('2026-11-15T20:00', '2026-11-14')).toBe(1)
        expect(daysUntilDate('2026-11-20T20:00', '2026-11-14')).toBe(6)
        expect(daysUntilDate('2026-11-12T20:00', '2026-11-14')).toBe(-2)
    })

    it('returns NaN for invalid dates', () => {
        expect(daysUntilDate('not-a-date', '2026-11-14')).toBeNaN()
        expect(daysUntilDate('2026-02-30', '2026-11-14')).toBeNaN()
    })
})

describe('formatScheduleCompact', () => {
    const deLabels = {today: 'Heute', tomorrow: 'Morgen', inDays: (n: number) => `in ${n}T`}
    const enLabels = {today: 'Today', tomorrow: 'in 1d', inDays: (n: number) => `in ${n}d`}

    it('shows time on the same day, or today label when time is absent', () => {
        expect(formatScheduleCompact('2026-11-14T19:30', '2026-11-14', 'de', deLabels)).toBe('19:30')
        expect(formatScheduleCompact('2026-11-14', '2026-11-14', 'de', deLabels)).toBe('Heute')
    })

    it('shows tomorrow and in-N-days within 6 days', () => {
        expect(formatScheduleCompact('2026-11-15T19:30', '2026-11-14', 'de', deLabels)).toBe('Morgen')
        expect(formatScheduleCompact('2026-11-17T19:30', '2026-11-14', 'de', deLabels)).toBe('in 3T')
        expect(formatScheduleCompact('2026-11-17T19:30', '2026-11-14', 'en', enLabels)).toBe('in 3d')
    })

    it('shows short calendar date beyond 6 days', () => {
        expect(formatScheduleCompact('2026-11-28T19:30', '2026-11-14', 'de', deLabels)).toBe('28.11.')
        expect(formatScheduleCompact('2026-11-28T19:30', '2026-11-14', 'en', enLabels)).toBe('28 Nov')
    })
})

describe('formatScheduleFull', () => {
    it('includes weekday, date and time', () => {
        const s = formatScheduleFull('2026-11-20T19:30', 'de')
        expect(s).toContain('20.11.')
        expect(s).toContain('19:30')
    })
})

describe('formatEurCompact & formatEurFull', () => {
    it('formats zero, negative (U+2212) and positive amounts concisely', () => {
        expect(formatEurCompact(0)).toBe('0 €')
        expect(formatEurCompact(-0.002)).toBe('0 €')
        expect(formatEurCompact(-12)).toBe('\u221212 €')
        expect(formatEurCompact(-12.5)).toBe('\u221212,50 €')
        expect(formatEurCompact(5)).toBe('+5 €')
        expect(formatEurCompact(5.25)).toBe('+5,25 €')
    })

    it('always includes two decimals in full format', () => {
        expect(formatEurFull(0)).toBe('0,00 €')
        expect(formatEurFull(-12)).toBe('\u221212,00 €')
        expect(formatEurFull(5)).toBe('+5,00 €')
    })
})

describe('deriveIdleIslandMode', () => {
    it('returns null when an evening is open or user is not logged in', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: true,
            isLoggedIn: true,
            schedules: [se()],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 0, balance: -10},
        })).toBeNull()

        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: false,
            schedules: [se()],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 0, balance: -10},
        })).toBeNull()
    })

    it('returns null before any query data arrives', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: undefined,
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: undefined,
        })).toBeNull()
    })

    it('prefers the next upcoming scheduled evening and attaches balance', () => {
        const mode = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 1, scheduled_at: '2026-11-10T19:00'}), se({id: 2, scheduled_at: '2026-11-18T20:00'})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 20, payments_total: 7.5, balance: -12.5},
        })
        expect(mode).toMatchObject({
            kind: 'schedule',
            appointment: {id: 2},
            balance: -12.5,
            balanceState: 'owed',
        })
    })

    it('falls back to personal balance when no upcoming evening is scheduled', () => {
        const mode = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 1, scheduled_at: '2026-11-10T19:00'}), se({id: 2, scheduled_at: '2026-11-18T20:00', evening_id: 99})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 15, balance: 5},
        })
        expect(mode).toEqual({
            kind: 'balance',
            balance: 5,
            penaltyTotal: 10,
            paymentsTotal: 15,
            balanceState: 'credit',
        })
    })

    it('waits for myBalance before falling back when regularMemberId is present', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: undefined,
        })).toBeNull()

        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: undefined,
            balanceFailed: true,
        })).toEqual({kind: 'fallback'})
    })

    it('only shows upcoming scheduled evening within the configured reminder days window', () => {
        // Default window (5 days): 5 days ahead shows schedule, 6 days ahead falls back to balance
        const withinDefault = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-11-19T20:00'})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 15, balance: 5},
        })
        expect(withinDefault?.kind).toBe('schedule')

        const outsideDefault = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-12-14T20:00'})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 15, balance: 5},
        })
        expect(outsideDefault).toEqual({
            kind: 'balance',
            balance: 5,
            penaltyTotal: 10,
            paymentsTotal: 15,
            balanceState: 'credit',
        })

        // Club setting overrides default (e.g. 2 days or 35 days)
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-11-18T20:00'})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 15, balance: 5},
            upcomingReminderDays: 2,
        })?.kind).toBe('balance')

        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-12-14T20:00'})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: undefined,
            upcomingReminderDays: 35,
        })?.kind).toBe('schedule')
    })

    it('waits for reminder settings when an upcoming evening exists', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-12-14T20:00'})],
            todayKey: '2026-11-14',
            regularMemberId: 1,
            myBalance: {regular_member_id: 1, penalty_total: 10, payments_total: 15, balance: 5},
            reminderReady: false,
        })).toBeNull()
    })

    it('falls back to account shortcut for members without regularMemberId and no appointments', () => {
        const mode = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [],
            todayKey: '2026-11-14',
            regularMemberId: null,
            myBalance: undefined,
        })
        expect(mode).toEqual({kind: 'fallback'})
    })
})
