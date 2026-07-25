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

export interface PenaltyEveningSummary {
    /** Stable React key + grouping key: the evening date (or log date) as `YYYY-MM-DD`. */
    key: string
    /** Best display date for the group (evening date preferred, else the log date). */
    date: string | null
    /** Total € across every penalty in this evening — the real sum, not just the latest entry. */
    total: number
    /** How many penalties fall on this evening. */
    count: number
    /** The individual penalties to show; anything beyond is folded into `more`. */
    items: RecentPenalty[]
    /** `count − items.length`: the penalties summarized as "and N more" (0 when all are shown). */
    more: number
}

function bestTs(p: MemberPenaltyRow): number {
    return tsOf(p.created_at) || tsOf(p.evening_date)
}

function toRecentPenalty(p: MemberPenaltyRow): RecentPenalty {
    return {
        id: p.id,
        icon: p.icon,
        name: p.penalty_type_name,
        amount: p.amount,
        date: p.created_at ?? p.evening_date,
    }
}

/**
 * The member's most recent penalties grouped by evening, newest evening first — a personal
 * "what did I rack up lately" feed for the start dashboard. Each group carries the evening's
 * total (so the headline number is the real sum, not just the last entry) and folds anything
 * beyond `itemsPerEvening` into an "and N more" count.
 *
 * @param maxEvenings     how many evening groups to return (newest first)
 * @param itemsPerEvening how many individual penalties to list per evening before summarizing
 */
export function recentPenaltyEvenings(
    list: MemberPenaltyRow[],
    maxEvenings: number,
    itemsPerEvening: number,
): PenaltyEveningSummary[] {
    const groups = new Map<string, {rows: MemberPenaltyRow[]; ts: number; date: string | null}>()
    for (const p of list) {
        const key = (p.evening_date ?? p.created_at ?? `id-${p.id}`).slice(0, 10)
        const g = groups.get(key)
        if (g) {
            g.rows.push(p)
            g.ts = Math.max(g.ts, bestTs(p))
        } else {
            groups.set(key, {rows: [p], ts: bestTs(p), date: p.evening_date ?? p.created_at})
        }
    }
    return [...groups.entries()]
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, maxEvenings)
        .map(([key, g]) => {
            const rows = [...g.rows].sort((a, b) => bestTs(b) - bestTs(a))
            const items = rows.slice(0, itemsPerEvening).map(toRecentPenalty)
            return {
                key,
                date: g.date,
                total: rows.reduce((s, r) => s + r.amount, 0),
                count: rows.length,
                items,
                more: rows.length - items.length,
            }
        })
}
