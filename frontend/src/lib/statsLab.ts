/**
 * Pure derivations for the Statistik-Labor (#68) — club records, head-to-head comparison
 * and the season comparison. Kept free of React so they can be unit-tested directly.
 */
import type {ClubRecord, SeasonRow, SeasonSnapshot} from '@/types'

/** Player shape the head-to-head reads — a subset of the year-stats player rows. */
export interface H2HPlayer {
    name: string
    nickname: string | null
    regular_member_id: number | null
    evenings: number
    penalty_total: number
    game_wins: number
    beer_rounds: number
    shot_rounds: number
    avg_pins: number | null
    throw_count: number
}

export type H2HFormat = 'eur' | 'count' | 'pins'

export interface H2HRow {
    key: 'evenings' | 'penaltyTotal' | 'penaltyPerEvening' | 'wins' | 'winRate' | 'beer' | 'shots' | 'avgPins'
    format: H2HFormat
    a: number | null
    b: number | null
    /** Which side "wins" the row, or null on a tie / missing data. Purely informational —
     * more penalties is not an achievement, so the component decides how to colour it. */
    winner: 'a' | 'b' | null
}

/** Throw-derived records are hidden when a club has camera throw tracking switched off (#78). */
const THROW_RECORD_KEYS = new Set(['best_throw_evening'])

export function isThrowRecord(key: string): boolean {
    return THROW_RECORD_KEYS.has(key)
}

export function visibleRecords(records: ClubRecord[], throwTracking: boolean): ClubRecord[] {
    return throwTracking ? records : records.filter(r => !isThrowRecord(r.key))
}

function ratio(total: number, count: number): number | null {
    return count > 0 ? total / count : null
}

function pick(a: number | null, b: number | null): 'a' | 'b' | null {
    if (a === null || b === null || a === b) return null
    return a > b ? 'a' : 'b'
}

/**
 * Side-by-side metric rows for two members over one season. Rows whose value is undefined for
 * both sides (e.g. neither member has thrown) are dropped so the table has no empty lines.
 */
export function headToHeadRows(a: H2HPlayer, b: H2HPlayer, throwTracking = true): H2HRow[] {
    const rows: H2HRow[] = [
        {key: 'evenings', format: 'count', a: a.evenings, b: b.evenings, winner: null},
        {key: 'penaltyTotal', format: 'eur', a: a.penalty_total, b: b.penalty_total, winner: null},
        {
            key: 'penaltyPerEvening', format: 'eur',
            a: ratio(a.penalty_total, a.evenings), b: ratio(b.penalty_total, b.evenings), winner: null,
        },
        {key: 'wins', format: 'count', a: a.game_wins, b: b.game_wins, winner: null},
        {
            key: 'winRate', format: 'count',
            a: ratio(a.game_wins, a.evenings), b: ratio(b.game_wins, b.evenings), winner: null,
        },
        {key: 'beer', format: 'count', a: a.beer_rounds, b: b.beer_rounds, winner: null},
        {key: 'shots', format: 'count', a: a.shot_rounds, b: b.shot_rounds, winner: null},
    ]
    if (throwTracking) {
        rows.push({key: 'avgPins', format: 'pins', a: a.avg_pins, b: b.avg_pins, winner: null})
    }
    return rows
        .filter(r => r.a !== null || r.b !== null)
        .map(r => ({...r, winner: pick(r.a, r.b)}))
}

export interface MergedSeason extends SeasonRow {
    /** When the season was formally closed (#39); null while it is still open. */
    closed_at: string | null
}

/**
 * Season rollups (computed from evenings, so open seasons appear too) enriched with the
 * close date from the season snapshot, when one exists.
 */
export function mergeSeasons(seasons: SeasonRow[], snapshots: SeasonSnapshot[]): MergedSeason[] {
    const closedAt = new Map(snapshots.map(s => [s.year, s.closed_at]))
    return [...seasons]
        .sort((x, y) => y.year - x.year)
        .map(s => ({...s, closed_at: closedAt.get(s.year) ?? null}))
}

/** Average penalty € per evening for a season — 0 for a season without evenings. */
export function seasonPenaltyPerEvening(season: SeasonRow): number {
    return season.evening_count > 0 ? season.penalty_total / season.evening_count : 0
}
