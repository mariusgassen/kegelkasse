import {describe, it, expect} from 'vitest'
import {
    daysUntilDate,
    deriveIdleIslandMode,
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

describe('deriveIdleIslandMode', () => {
    it('returns null when an evening is open or user is not logged in', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: true,
            isLoggedIn: true,
            schedules: [se({scheduled_at: '2026-11-16T19:30'})],
            todayKey: '2026-11-14',
        })).toBeNull()

        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: false,
            schedules: [se({scheduled_at: '2026-11-16T19:30'})],
            todayKey: '2026-11-14',
        })).toBeNull()
    })

    it('returns null before schedule query data arrives', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: undefined,
            todayKey: '2026-11-14',
        })).toBeNull()
    })

    it('returns the next upcoming scheduled evening within the reminder window', () => {
        const mode = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 1, scheduled_at: '2026-11-10T19:00'}), se({id: 2, scheduled_at: '2026-11-18T20:00'})],
            todayKey: '2026-11-14',
        })
        expect(mode).toMatchObject({
            kind: 'schedule',
            appointment: {id: 2},
        })
    })

    it('stays quietly at rest (null) when no upcoming evening is scheduled', () => {
        const mode = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 1, scheduled_at: '2026-11-10T19:00'}), se({id: 2, scheduled_at: '2026-11-18T20:00', evening_id: 99})],
            todayKey: '2026-11-14',
        })
        expect(mode).toBeNull()
    })

    it('only shows upcoming scheduled evening within the configured reminder days window', () => {
        // Default window (5 days): 5 days ahead shows schedule, further ahead rests quietly (null)
        const withinDefault = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-11-19T20:00'})],
            todayKey: '2026-11-14',
        })
        expect(withinDefault?.kind).toBe('schedule')

        const outsideDefault = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-12-14T20:00'})],
            todayKey: '2026-11-14',
        })
        expect(outsideDefault).toBeNull()

        // Club setting overrides default (e.g. 2 days or 35 days)
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-11-18T20:00'})],
            todayKey: '2026-11-14',
            upcomingReminderDays: 2,
        })).toBeNull()

        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-12-14T20:00'})],
            todayKey: '2026-11-14',
            upcomingReminderDays: 35,
        })?.kind).toBe('schedule')
    })

    it('waits for reminder settings when an upcoming evening exists', () => {
        expect(deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [se({id: 2, scheduled_at: '2026-12-14T20:00'})],
            todayKey: '2026-11-14',
            reminderReady: false,
        })).toBeNull()
    })

    it('stays quietly at rest (null) when no appointments exist', () => {
        const mode = deriveIdleIslandMode({
            hasOpenEvening: false,
            isLoggedIn: true,
            schedules: [],
            todayKey: '2026-11-14',
        })
        expect(mode).toBeNull()
    })
})
