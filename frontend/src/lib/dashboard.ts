/**
 * Pure helpers for the personalized start dashboard (#66, "Für dich").
 *
 * The dashboard is pure composition over existing endpoints (schedule, my-balance, committee,
 * stats/me) — no new backend. These functions do the derivation so the page component stays a
 * thin view and the logic is unit-testable in isolation.
 */
import type {ClubAnnouncement, ClubTrip, ScheduledEvening, ThrowStats} from '../types'

/**
 * The next upcoming scheduled evening that has not been started yet, or `null`.
 *
 * "Upcoming" is compared on the calendar date (so an evening later *today* still counts even if
 * its start time has passed), and evenings already linked to a started `Evening` (`evening_id`)
 * are excluded — those are handled by the live-evening flow, not the "next appointment" card.
 *
 * @param todayKey local `YYYY-MM-DD` for "today" (passed in so the function stays pure/testable).
 */
export function nextAppointment(
    evenings: ScheduledEvening[],
    todayKey: string,
): ScheduledEvening | null {
    return (
        evenings
            .filter(e => e.evening_id == null && e.scheduled_at.slice(0, 10) >= todayKey)
            // ISO datetime strings sort correctly lexicographically.
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null
    )
}

export type CommunityKind = 'announcement' | 'trip'

export interface CommunityItem {
    kind: CommunityKind
    id: number
    title: string
    subtitle: string | null
    /** Sort timestamp in ms (from `created_at`); 0 when unknown so it sinks to the bottom. */
    ts: number
}

function tsOf(iso: string | null): number {
    if (!iso) return 0
    const ms = Date.parse(iso)
    return Number.isNaN(ms) ? 0 : ms
}

/**
 * Merge the latest announcements and trips into a single "news" feed, newest first, capped at
 * `limit`. Both are ordered by when they were posted (`created_at`).
 */
export function recentCommunity(
    announcements: ClubAnnouncement[],
    trips: ClubTrip[],
    limit: number,
): CommunityItem[] {
    const items: CommunityItem[] = [
        ...announcements.map(a => ({
            kind: 'announcement' as const,
            id: a.id,
            title: a.title,
            subtitle: a.text ?? null,
            ts: tsOf(a.created_at),
        })),
        ...trips.map(t => ({
            kind: 'trip' as const,
            id: t.id,
            title: t.destination,
            subtitle: t.note ?? null,
            ts: tsOf(t.created_at),
        })),
    ]
    return items.sort((a, b) => b.ts - a.ts).slice(0, limit)
}

export type BalanceState = 'owed' | 'credit' | 'settled'

/**
 * Classify a member's balance. `balance < 0` means the member owes the till, `> 0` means credit.
 * A small epsilon avoids showing a rounding-noise cent as debt/credit.
 */
export function balanceState(balance: number | null | undefined): BalanceState {
    if (balance == null) return 'settled'
    if (balance < -0.01) return 'owed'
    if (balance > 0.01) return 'credit'
    return 'settled'
}

/**
 * The member's per-evening throw averages, oldest→newest, capped to the last `limit` evenings —
 * the series behind the profile/season sparkline. Empty when there is no throw data.
 */
export function recentThrowAvgs(stats: ThrowStats | undefined | null, limit: number): number[] {
    if (!stats?.evenings?.length) return []
    return [...stats.evenings]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-limit)
        .map(e => e.avg_pins)
}

/** A row as returned by `GET /club/member-penalties/{mid}` (the fields the dashboard uses). */
export interface MemberPenaltyRow {
    id: number
    icon: string
    penalty_type_name: string
    amount: number
    evening_date: string | null
    created_at: string | null
}

export interface RecentPenalty {
    id: number
    icon: string
    name: string
    amount: number
    /** Best available date for the entry: the log time, falling back to the evening's date. */
    date: string | null
}

/**
 * The member's most recent penalties, newest first, capped at `limit` — a personal "what did I do
 * last" feed for the start dashboard. Ordered by log time (`created_at`), falling back to the
 * evening date so entries without a precise timestamp still sort sensibly.
 */
export function recentPenalties(list: MemberPenaltyRow[], limit: number): RecentPenalty[] {
    return [...list]
        .sort((a, b) => (tsOf(b.created_at) || tsOf(b.evening_date)) - (tsOf(a.created_at) || tsOf(a.evening_date)))
        .slice(0, limit)
        .map(p => ({
            id: p.id,
            icon: p.icon,
            name: p.penalty_type_name,
            amount: p.amount,
            date: p.created_at ?? p.evening_date,
        }))
}
