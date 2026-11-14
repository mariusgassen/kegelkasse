/**
 * Pure builder for the detailed, filterable penalty timeline — the same structure
 * `ProtocolPage` renders for the live/open evening (penalty entries interleaved with
 * game start/finish dividers, filterable by player and game). Reused read-only for a
 * closed evening's History detail (#86 follow-up) so the actual sequence of penalties
 * and games is visible there without reopening the evening.
 */
import type {Evening, Game, PenaltyLogEntry} from '../types'

export type PenaltyTimelineEvent =
    | {kind: 'penalty'; entry: PenaltyLogEntry; gameName: string | null; ts: number}
    | {kind: 'game_started'; game: Game; ts: number}
    | {kind: 'game_finished'; game: Game; ts: number}

export interface PenaltyTimelineOptions {
    /** Only entries for this player. `null` (default) = everyone. */
    filterPlayerId?: number | null
    /** Only entries for this game. `-1` = manual entries (no game). `null` (default) = all. */
    filterGameId?: number | null
}

/**
 * Build the chronological penalty timeline (newest first): filtered penalty entries
 * plus game start/finish dividers. Dividers are only added when no player filter is
 * active — mirrors `ProtocolPage`, where a per-player view has no use for "game X
 * started" markers that aren't about anyone in particular.
 */
export function buildPenaltyTimeline(evening: Evening, opts: PenaltyTimelineOptions = {}): PenaltyTimelineEvent[] {
    const {filterPlayerId = null, filterGameId = null} = opts

    let log = [...evening.penalty_log].reverse()
    if (filterPlayerId !== null) log = log.filter(l => l.player_id === filterPlayerId)
    if (filterGameId !== null) {
        log = log.filter(l => filterGameId === -1 ? l.game_id === null : l.game_id === filterGameId)
    }

    const timeline: PenaltyTimelineEvent[] = log.map(e => ({
        kind: 'penalty',
        entry: e,
        gameName: e.game_id != null ? (evening.games.find(g => g.id === e.game_id)?.name ?? null) : null,
        ts: e.client_timestamp,
    }))

    if (filterPlayerId === null) {
        for (const g of evening.games) {
            if (g.started_at) timeline.push({kind: 'game_started', game: g, ts: new Date(g.started_at).getTime()})
            if (g.finished_at) timeline.push({kind: 'game_finished', game: g, ts: new Date(g.finished_at).getTime()})
        }
        timeline.sort((a, b) => b.ts - a.ts)
    }

    return timeline
}

/** Games that have at least one associated penalty entry — the candidates for the game filter chips. */
export function gamesWithPenalties(evening: Evening): Game[] {
    return evening.games.filter(g => evening.penalty_log.some(l => l.game_id === g.id))
}

/** Whether any penalty entry was logged manually (not tied to a game). */
export function hasManualPenalties(evening: Evening): boolean {
    return evening.penalty_log.some(l => l.game_id === null)
}

// Spelled out (not built from a template) so the token test can see every var() this file uses.
const GAME_BANDS = ['var(--team-0)', 'var(--team-1)', 'var(--team-2)', 'var(--team-3)', 'var(--team-4)', 'var(--team-5)']

/**
 * Colour band of a game on the protocol timeline: the game's position among the evening's started
 * games (in start order), cycled through the six team colours. Lets a stripe on each penalty card,
 * and the start/finish dividers, show which game a penalty happened in.
 */
export function gameBandColor(index: number): string {
    return GAME_BANDS[index % GAME_BANDS.length]
}

/**
 * Which game a penalty belongs to, for colouring: its `game_id` if it has one (automatic loser
 * penalties), otherwise the game that was running when it was booked — started at or before the
 * timestamp and not yet finished. Returns the band index (see `gameBandColor`) or `null` for a
 * penalty booked between games.
 */
export function gameBandIndex(games: Game[], ts: number, gameId: number | null): number | null {
    const started = games
        .filter(g => g.started_at)
        .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime())
    if (gameId != null) {
        const i = started.findIndex(g => g.id === gameId)
        return i >= 0 ? i : null
    }
    // Latest game whose window contains the timestamp (games can overlap if one was left running).
    for (let i = started.length - 1; i >= 0; i--) {
        const g = started[i]
        const from = new Date(g.started_at!).getTime()
        const to = g.finished_at ? new Date(g.finished_at).getTime() : Infinity
        if (ts >= from && ts <= to) return i
    }
    return null
}
