/**
 * Pure helpers for the Dynamic Island's idle mode (when no evening is running).
 *
 * Composes over the existing `schedule` endpoint (`lib/dashboard.ts`): surfaces the next
 * upcoming scheduled evening (with inline 1-tap RSVP) while it sits inside the club's reminder
 * window, and leaves the island quietly at rest (`null`) otherwise instead of nagging with an
 * always-on account balance.
 */
import type {ScheduledEvening} from '../types'
import {nextAppointment} from './dashboard'

export type IdleIslandMode = {
    kind: 'schedule'
    appointment: ScheduledEvening
}

/** Local `YYYY-MM-DD` date string matching `HomePage` / `SchedulePage`. */
export function todayLocalKey(now: Date = new Date()): string {
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function parseYmdUtc(ymd: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    const utc = Date.UTC(year, month - 1, day)
    const check = new Date(utc)
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        return null
    }
    return utc
}

/** Integer calendar-day difference between `scheduledAt` and `todayKey` (`0` = today, `1` = tomorrow). */
export function daysUntilDate(scheduledAt: string, todayKey: string): number {
    const targetUtc = parseYmdUtc(scheduledAt)
    const todayUtc = parseYmdUtc(todayKey)
    if (targetUtc === null || todayUtc === null) return Number.NaN
    return Math.round((targetUtc - todayUtc) / 86_400_000)
}

/** Short label (≤ 7 chars) suited for the compact island's 72 pt trailing slot. */
export function formatScheduleCompact(
    scheduledAt: string,
    todayKey: string,
    locale: string,
    labels: {today: string; tomorrow: string; inDays: (days: number) => string},
): string {
    const days = daysUntilDate(scheduledAt, todayKey)
    const timeMatch = /T(\d{2}:\d{2})/.exec(scheduledAt)
    const time = timeMatch ? timeMatch[1] : ''

    if (!Number.isNaN(days)) {
        if (days <= 0) return time || labels.today
        if (days === 1) return labels.tomorrow
        if (days <= 6) return labels.inDays(days)
    }

    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduledAt)
    if (!m) return time || labels.today
    if (locale === 'en') {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
    }
    return `${m[3]}.${m[2]}.`
}

/** Readable date + time heading for the expanded island view. */
export function formatScheduleFull(scheduledAt: string, locale: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduledAt)
    if (!m) return scheduledAt
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const dayStr = d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
    })
    const timeMatch = /T(\d{2}:\d{2})/.exec(scheduledAt)
    return timeMatch ? `${dayStr} · ${timeMatch[1]}` : dayStr
}

export const DEFAULT_UPCOMING_REMINDER_DAYS = 5

/**
 * Decide what the island displays when no evening is running:
 * - Next upcoming scheduled evening within `upcomingReminderDays` (default 5, matching the club's
 *   `upcoming_evening.days_before` reminder setting)
 * - `null` (quiet resting pill) when no evening is within the window, an evening is open, the user
 *   is signed out, or data hasn't loaded yet.
 */
export function deriveIdleIslandMode(params: {
    hasOpenEvening: boolean
    isLoggedIn: boolean
    schedules: ScheduledEvening[] | undefined
    todayKey: string
    upcomingReminderDays?: number | null
    reminderReady?: boolean
}): IdleIslandMode | null {
    const {
        hasOpenEvening,
        isLoggedIn,
        schedules,
        todayKey,
        upcomingReminderDays,
        reminderReady = true,
    } = params
    if (!isLoggedIn || hasOpenEvening || schedules === undefined) return null

    const next = nextAppointment(schedules, todayKey)
    if (!next || !reminderReady) return null

    const windowDays = Math.max(0, upcomingReminderDays ?? DEFAULT_UPCOMING_REMINDER_DAYS)
    const daysAhead = daysUntilDate(next.scheduled_at, todayKey)
    const upcoming = Number.isNaN(daysAhead) || daysAhead <= windowDays ? next : null

    return upcoming ? {kind: 'schedule', appointment: upcoming} : null
}
