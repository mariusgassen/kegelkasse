/**
 * Pure derivations for the visual cues in the tablet quick entry (TabletQuickEntryPage):
 * how often each penalty was booked tonight, and where each drink round sits on the evening's
 * time axis. Kept free of React so they can be tested on their own.
 */
import type {DrinkRound, PenaltyLogEntry} from '@/types.ts'

/**
 * How many times each penalty type was booked tonight, keyed by penalty name.
 *
 * Counts what a player actually received: one per log entry, or its `amount` for count-mode entries
 * (a "×3" entry is three). Absence entries (`player_id === null`) and automatic loser penalties
 * (`game_id !== null`) are left out — they aren't what someone tapped at the table.
 */
export function penaltyTypeCounts(log: PenaltyLogEntry[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const l of log) {
        if (l.player_id == null || l.game_id != null) continue
        const n = l.mode === 'count' ? Math.max(1, Math.round(l.amount)) : 1
        counts.set(l.penalty_type_name, (counts.get(l.penalty_type_name) ?? 0) + n)
    }
    return counts
}

export interface DrinkTimelinePoint {
    id: number
    type: DrinkRound['drink_type']
    /** Number of people in the round. */
    size: number
    time: number
    /** Horizontal position on the track, 0–100 %. */
    left: number
}

export interface DrinkTimeline {
    start: number
    end: number
    points: DrinkTimelinePoint[]
    /** The largest round, so marker heights compare across the evening. */
    maxSize: number
}

/**
 * Places every drink round on a time axis running from the first round to `now` (or the last round,
 * if that is later — clock skew between devices). Returns `null` when there is nothing to draw.
 * A single round sits in the middle instead of on the left edge.
 */
export function drinkTimeline(rounds: DrinkRound[], now: number): DrinkTimeline | null {
    if (rounds.length === 0) return null
    const sorted = [...rounds].sort((a, b) => a.client_timestamp - b.client_timestamp)
    const start = sorted[0].client_timestamp
    const end = Math.max(now, sorted[sorted.length - 1].client_timestamp)
    const span = end - start
    const points = sorted.map(r => ({
        id: r.id,
        type: r.drink_type,
        size: r.participant_ids.length,
        time: r.client_timestamp,
        left: span > 0 ? ((r.client_timestamp - start) / span) * 100 : 50,
    }))
    return {start, end, points, maxSize: Math.max(1, ...points.map(p => p.size))}
}
