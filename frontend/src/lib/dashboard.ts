/**
 * Pure helpers for the personalized start dashboard (#66, "Für dich").
 *
 * The dashboard is pure composition over existing endpoints (schedule, my-balance, committee,
 * stats/me) — no new backend. These functions do the derivation so the page component stays a
 * thin view and the logic is unit-testable in isolation.
 */
import type {ClubAnnouncement, ClubDocument, ClubTrip, ScheduledEvening, Sticker, ThrowStats} from '../types'

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

export type CommunityKind = 'announcement' | 'trip' | 'sticker' | 'document'

export interface CommunityItem {
    kind: CommunityKind
    id: number
    title: string
    subtitle: string | null
    /** Effective display date/datetime (latest activity when newer than post date, else post date). */
    date: string | null
    /** Post's own date (`stuck_on` for stickers when set, else `updated_at ?? created_at`). */
    postDate: string | null
    /** Latest comment/reaction timestamp, if any. */
    lastActivityAt: string | null
    commentCount: number
    reactionCount: number
    /** Sort timestamp in ms (newest first); 0 when unknown so it sinks to the bottom. */
    ts: number
    /** Tie-breaker timestamp in ms (e.g. `created_at` when stickers share the same `stuck_on` day). */
    tieTs: number
}

function tsOf(iso: string | null | undefined): number {
    if (!iso) return 0
    const ms = Date.parse(iso)
    return Number.isNaN(ms) ? 0 : ms
}

/**
 * Format a news item's date for the Start feed: day + short month in the current year, adding the
 * year for older entries (such as throwback stickers). Date-only strings (`YYYY-MM-DD`) are
 * parsed as local calendar dates so they never shift across timezones.
 */
export function formatNewsDate(iso: string | null, locale: string, currentYear?: number): string {
    if (!iso) return ''
    const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const year = currentYear ?? new Date().getFullYear()
    const opts: Intl.DateTimeFormatOptions = d.getFullYear() === year
        ? {day: '2-digit', month: 'short'}
        : {day: '2-digit', month: 'short', year: 'numeric'}
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', opts)
}

function buildCommunityItem(params: {
    kind: CommunityKind
    id: number
    title: string
    subtitle: string | null
    postDate: string | null
    postTs: number
    tieTs: number
    lastActivityAt: string | null
    commentCount: number
    reactionCount: number
}): CommunityItem {
    const activityTs = tsOf(params.lastActivityAt)
    const activeNewer = activityTs > params.postTs
    return {
        kind: params.kind,
        id: params.id,
        title: params.title,
        subtitle: params.subtitle,
        date: activeNewer ? params.lastActivityAt : params.postDate,
        postDate: params.postDate,
        lastActivityAt: params.lastActivityAt,
        commentCount: params.commentCount,
        reactionCount: params.reactionCount,
        ts: Math.max(params.postTs, activityTs),
        tieTs: params.tieTs,
    }
}

/**
 * Merge the latest announcements, trips and stickers into a single "news" feed, newest first,
 * capped at `limit`. Stickers order by when they were stickered (`stuck_on`, falling back to
 * `updated_at ?? created_at`); announcements and trips order by last added/edited
 * (`updated_at ?? created_at`). Newer comment or item-reaction activity (`last_activity_at`)
 * bubbles an item up so active threads stay visible. `kind` narrows the feed before the cap.
 */
export function recentCommunity(
    announcements: ClubAnnouncement[],
    trips: ClubTrip[],
    stickers: Sticker[],
    limit: number,
    kind?: CommunityKind,
    documents: ClubDocument[] = [],
): CommunityItem[] {
    const items: CommunityItem[] = [
        ...announcements.map(a => {
            const postDate = a.updated_at ?? a.created_at
            const postTs = tsOf(postDate)
            return buildCommunityItem({
                kind: 'announcement',
                id: a.id,
                title: a.title,
                subtitle: a.text ?? null,
                postDate,
                postTs,
                tieTs: postTs,
                lastActivityAt: a.last_activity_at ?? null,
                commentCount: a.comment_count ?? 0,
                reactionCount: a.reaction_count ?? 0,
            })
        }),
        ...trips.map(t => {
            const postDate = t.updated_at ?? t.created_at
            const postTs = tsOf(postDate)
            return buildCommunityItem({
                kind: 'trip',
                id: t.id,
                title: t.destination,
                subtitle: t.note ?? null,
                postDate,
                postTs,
                tieTs: postTs,
                lastActivityAt: t.last_activity_at ?? null,
                commentCount: t.comment_count ?? 0,
                reactionCount: t.reaction_count ?? 0,
            })
        }),
        ...stickers.map(st => {
            const fallbackDate = st.updated_at ?? st.created_at
            const postDate = st.stuck_on ?? fallbackDate
            // When stuck_on matches the upload day, keep created_at's time-of-day for exact ordering.
            const postTs = st.stuck_on
                ? (st.created_at && st.created_at.slice(0, 10) === st.stuck_on
                    ? tsOf(st.created_at)
                    : tsOf(st.stuck_on))
                : tsOf(fallbackDate)
            return buildCommunityItem({
                kind: 'sticker',
                id: st.id,
                title: st.place_name,
                subtitle: st.caption ?? null,
                postDate,
                postTs,
                tieTs: tsOf(st.created_at),
                lastActivityAt: st.last_activity_at ?? null,
                commentCount: st.comment_count ?? 0,
                reactionCount: st.reaction_count ?? 0,
            })
        }),
        ...documents.map(doc => {
            const postDate = doc.uploaded_at ?? doc.decision_date ?? doc.effective_date ?? null
            const postTs = tsOf(postDate)
            return buildCommunityItem({
                kind: 'document',
                id: doc.id,
                title: doc.title,
                subtitle: doc.change_summary || doc.summary || null,
                postDate,
                postTs,
                tieTs: postTs,
                lastActivityAt: null,
                commentCount: 0,
                reactionCount: 0,
            })
        }),
    ]
    return items
        .filter(i => !kind || i.kind === kind)
        .sort((a, b) => (b.ts - a.ts) || (b.tieTs - a.tieTs) || (b.id - a.id))
        .slice(0, limit)
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
