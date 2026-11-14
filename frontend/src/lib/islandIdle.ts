/**
 * Pure helpers for the Dynamic Island's idle mode (when no evening is running).
 *
 * Composes over the existing `schedule` and `my-balance` endpoints (`lib/dashboard.ts`):
 * shows the next upcoming scheduled evening (with inline RSVP + personal balance) when one is
 * scheduled, falls back to the member's treasury balance when no upcoming evening is planned,
 * and falls back to a quick schedule shortcut when neither is available.
 */
import type {ScheduledEvening} from '../types'
import {balanceState, nextAppointment, type BalanceState} from './dashboard'

export interface MyBalanceSummary {
    regular_member_id: number | null
    penalty_total: number | null
    payments_total: number | null
    balance: number | null
}

export type IdleIslandMode =
    | {
          kind: 'schedule'
          appointment: ScheduledEvening
          balance: number | null
          balanceState: BalanceState
      }
    | {
          kind: 'balance'
          balance: number
          penaltyTotal: number | null
          paymentsTotal: number | null
          balanceState: BalanceState
      }
    | {
          kind: 'fallback'
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

/**
 * Compact € formatting for the island pill. Uses U+2212 (`−`) for negative amounts as expected by
 * `NumberText`, omits `.00` for whole euros so figures stay inside the 72 pt compact slot, and
 * prefixes positive non-zero credits with `+`.
 */
export function formatEurCompact(amount: number): string {
    if (Math.abs(amount) < 0.005) return '0 €'
    const abs = Math.abs(amount)
    const isWhole = Math.abs(abs - Math.round(abs)) < 0.005
    const formatted = abs.toLocaleString('de-DE', {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: isWhole ? 0 : 2,
    })
    const sign = amount < 0 ? '\u2212' : '+'
    return `${sign}${formatted} €`
}

/** Full € formatting with two decimals and U+2212 (`−`) for negative values. */
export function formatEurFull(amount: number): string {
    if (Math.abs(amount) < 0.005) return '0,00 €'
    const abs = Math.abs(amount)
    const formatted = abs.toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    const sign = amount < 0 ? '\u2212' : '+'
    return `${sign}${formatted} €`
}

/**
 * Decide what the island displays when no evening is running:
 * 1. Next upcoming scheduled evening (carries personal balance if known)
 * 2. Personal balance fallback when no evening is scheduled
 * 3. Schedule quick-shortcut fallback once queries have resolved and neither exists
 * Returns `null` while an evening is open, the user is signed out, or data hasn't loaded yet.
 */
export function deriveIdleIslandMode(params: {
    hasOpenEvening: boolean
    isLoggedIn: boolean
    schedules: ScheduledEvening[] | undefined
    todayKey: string
    regularMemberId: number | null
    myBalance: MyBalanceSummary | undefined
}): IdleIslandMode | null {
    const {hasOpenEvening, isLoggedIn, schedules, todayKey, regularMemberId, myBalance} = params
    if (!isLoggedIn || hasOpenEvening) return null

    const hasScheduleData = schedules !== undefined
    const hasBalanceData = regularMemberId == null || myBalance !== undefined
    if (!hasScheduleData && !hasBalanceData) return null

    const upcoming = schedules ? nextAppointment(schedules, todayKey) : null
    const rawBalance = regularMemberId != null ? (myBalance?.balance ?? null) : null
    const bState = balanceState(rawBalance)

    if (upcoming) {
        return {
            kind: 'schedule',
            appointment: upcoming,
            balance: rawBalance,
            balanceState: bState,
        }
    }

    if (rawBalance != null) {
        return {
            kind: 'balance',
            balance: rawBalance,
            penaltyTotal: myBalance?.penalty_total ?? null,
            paymentsTotal: myBalance?.payments_total ?? null,
            balanceState: bState,
        }
    }

    if (!hasScheduleData) return null
    return {kind: 'fallback'}
}
