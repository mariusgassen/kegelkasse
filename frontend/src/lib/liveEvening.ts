/**
 * Pure helpers for the live evening cockpit (#65, "Abend-Modus").
 *
 * The Live view is a read-only, always-fresh cockpit over the active evening (the
 * `useActiveEvening` hook already keeps `Evening` live via SSE + polling). These functions
 * derive the scoreboard state and the chronological event ticker so the view stays a thin
 * component and the logic is unit-testable.
 *
 * Note on the ticker: penalties, drink rounds, highlights and throws all carry timestamps
 * (`client_timestamp` / `created_at`), so they interleave chronologically. Only *milestone* throws
 * (Alle Neune) enter the feed — an evening produces hundreds of throws, and the full stream would
 * push everything else out of the capped ticker within a single game. The running throw state stays
 * in the scoreboard header, which answers "what's the score" while the ticker answers "what just
 * happened".
 */
import type {Evening, EveningPlayer, Game} from '../types'
import {buildTurnOrder} from './turnOrder'

/** Euro value of a penalty log entry (count-mode = count × unit_amount, euro-mode = amount). */
export function penaltyEuro(unit_amount: number | null, amount: number): number {
    return unit_amount != null ? amount * unit_amount : amount
}

export interface LiveThrow {
    pins: number
    cumulative: number | null
    playerName: string | null
}

export interface LiveGameState {
    /** The currently running game, or null when none is running. */
    game: Game | null
    activePlayer: EveningPlayer | null
    nextPlayer: EveningPlayer | null
    lastThrow: LiveThrow | null
}

function displayName(p: EveningPlayer): string {
    return p.nickname || p.name
}

/**
 * Derive the live scoreboard state from the evening: the running game, whose turn it is
 * (`active_player_id`), the next player in throw order, and the most recent throw.
 *
 * Next-player order reuses the shared `buildTurnOrder`. In block mode the block is the active
 * player's team, so the block index is taken from that team's position; in alternating mode the
 * index is unused.
 */
export function currentGameState(evening: Evening | null): LiveGameState {
    const empty: LiveGameState = {game: null, activePlayer: null, nextPlayer: null, lastThrow: null}
    if (!evening) return empty

    const game = evening.games.find(g => g.status === 'running') ?? null
    if (!game) return empty

    const byId = new Map(evening.players.map(p => [p.id, p]))
    const activePlayer = game.active_player_id != null ? byId.get(game.active_player_id) ?? null : null

    let nextPlayer: EveningPlayer | null = null
    if (activePlayer) {
        const mode = game.turn_mode ?? 'alternating'
        const blockIdx = activePlayer.team_id != null
            ? Math.max(0, evening.teams.findIndex(t => t.id === activePlayer.team_id))
            : 0
        const order = buildTurnOrder(evening.players, evening.teams, mode, blockIdx)
        const idx = order.findIndex(p => p.id === activePlayer.id)
        if (idx >= 0 && order.length > 1) nextPlayer = order[(idx + 1) % order.length]
    }

    let lastThrow: LiveThrow | null = null
    if (game.throws.length > 0) {
        const t = game.throws.reduce((a, b) => (b.throw_num >= a.throw_num ? b : a))
        const thrower = t.player_id != null ? byId.get(t.player_id) : undefined
        lastThrow = {pins: t.pins, cumulative: t.cumulative, playerName: thrower ? displayName(thrower) : null}
    }

    return {game, activePlayer, nextPlayer, lastThrow}
}

export type LiveEventKind = 'penalty' | 'drink' | 'highlight' | 'throw'

/** Pin count that makes a throw a milestone worth its own ticker entry ("Alle Neune"). */
export const ALL_NINE = 9

export interface LiveEvent {
    kind: LiveEventKind
    /** Stable, unique key (`kind-id`). */
    key: string
    /** Sort timestamp (ms). */
    ts: number
    icon: string
    title: string
    subtitle: string | null
    /** Euro amount for penalties; null otherwise. */
    amount: number | null
}

export interface EventFeedOptions {
    /** Maximum number of entries. Default 30. */
    limit?: number
    /**
     * Include milestone throws (Alle Neune). Off by default so the caller has to opt in with the
     * club's throw-tracking setting (#78) — a club that records no throws never sees the kind.
     */
    throws?: boolean
    /**
     * Translator for the drink-round fallback label (used when the round has no `variety`).
     * Optional so the function stays callable without an i18n context (e.g. plain unit tests);
     * omitting it falls back to the German label, matching the feed's pre-i18n behavior.
     */
    t?: (key: 'drinks.beer' | 'drinks.shots') => string
}

/**
 * Build the chronological event ticker (newest first) from penalties, drink rounds, highlights and
 * — when `throws` is set — milestone throws. Capped at `limit`. Player/participant names use the
 * Kegelname convention.
 */
export function buildEventFeed(evening: Evening | null, opts: EventFeedOptions = {}): LiveEvent[] {
    const {limit = 30, throws = false, t} = opts
    if (!evening) return []
    const byId = new Map(evening.players.map(p => [p.id, p]))
    const events: LiveEvent[] = []

    for (const p of evening.penalty_log) {
        events.push({
            kind: 'penalty',
            key: `penalty-${p.id}`,
            ts: p.client_timestamp,
            icon: p.icon || '⚖️',
            title: p.player_name,
            subtitle: p.penalty_type_name,
            amount: penaltyEuro(p.unit_amount, p.amount),
        })
    }

    for (const d of evening.drink_rounds) {
        const names = d.participant_ids
            .map(id => byId.get(id))
            .filter((p): p is EveningPlayer => !!p)
            .map(displayName)
        events.push({
            kind: 'drink',
            key: `drink-${d.id}`,
            ts: d.client_timestamp,
            icon: d.drink_type === 'shots' ? '🥃' : '🍺',
            title: d.variety || (t
                ? (d.drink_type === 'shots' ? t('drinks.shots') : t('drinks.beer'))
                : (d.drink_type === 'shots' ? 'Schnaps' : 'Bier')),
            subtitle: names.length > 0 ? names.join(', ') : null,
            amount: null,
        })
    }

    for (const h of evening.highlights) {
        const ts = h.created_at ? Date.parse(h.created_at) : NaN
        events.push({
            kind: 'highlight',
            key: `highlight-${h.id}`,
            ts: Number.isNaN(ts) ? 0 : ts,
            icon: '✨',
            title: h.text || (h.media_url ? '📷' : '✨'),
            subtitle: null,
            amount: null,
        })
    }

    if (throws) {
        for (const g of evening.games) {
            for (const th of g.throws) {
                if (th.pins < ALL_NINE) continue
                // No parseable timestamp (legacy row, offline-queued throw) — a made-up position in
                // a chronological feed is worse than leaving it out; the scoreboard still shows it.
                const ts = th.created_at ? Date.parse(th.created_at) : NaN
                if (Number.isNaN(ts)) continue
                const thrower = th.player_id != null ? byId.get(th.player_id) : undefined
                events.push({
                    kind: 'throw',
                    key: `throw-${th.id}`,
                    ts,
                    icon: '🎳',
                    title: thrower ? displayName(thrower) : g.name,
                    subtitle: null,
                    amount: null,
                })
            }
        }
    }

    return events.sort((a, b) => b.ts - a.ts).slice(0, limit)
}

export interface EveningTotals {
    penaltyEuro: number
    beerRounds: number
    shotRounds: number
    gamesFinished: number
    gamesTotal: number
}

/** Headline totals for the live stat row. Penalty total is uncapped (a live tally, not a bill). */
export function eveningTotals(evening: Evening | null): EveningTotals {
    if (!evening) return {penaltyEuro: 0, beerRounds: 0, shotRounds: 0, gamesFinished: 0, gamesTotal: 0}
    return {
        penaltyEuro: evening.penalty_log.reduce((sum, p) => sum + penaltyEuro(p.unit_amount, p.amount), 0),
        beerRounds: evening.drink_rounds.filter(d => d.drink_type === 'beer').length,
        shotRounds: evening.drink_rounds.filter(d => d.drink_type === 'shots').length,
        gamesFinished: evening.games.filter(g => g.status === 'finished').length,
        gamesTotal: evening.games.length,
    }
}

export interface RankingRow {
    player: EveningPlayer
    euro: number
}

/**
 * Tonight's penalty ranking for the live tab: every present player with their uncapped euro total,
 * highest first, name as tie-break. Absence entries (`player_id === null`) are left out — they belong
 * to members who aren't at the table.
 */
export function penaltyRanking(evening: Evening | null): RankingRow[] {
    if (!evening) return []
    const sums = new Map<number, number>()
    for (const p of evening.penalty_log) {
        if (p.player_id == null) continue
        sums.set(p.player_id, (sums.get(p.player_id) ?? 0) + penaltyEuro(p.unit_amount, p.amount))
    }
    return evening.players
        .map(player => ({player, euro: sums.get(player.id) ?? 0}))
        .sort((a, b) => b.euro - a.euro || displayName(a.player).localeCompare(displayName(b.player)))
}

export interface CurvePoint {
    ts: number
    euro: number
}

/**
 * The evening's penalty total over time — a running sum in timestamp order, starting at 0 just
 * before the first penalty so the line rises from the baseline. Empty without penalties.
 */
export function penaltyCurve(evening: Evening | null): CurvePoint[] {
    if (!evening || evening.penalty_log.length === 0) return []
    const sorted = [...evening.penalty_log].sort((a, b) => a.client_timestamp - b.client_timestamp)
    const points: CurvePoint[] = [{ts: sorted[0].client_timestamp, euro: 0}]
    let sum = 0
    for (const p of sorted) {
        sum += penaltyEuro(p.unit_amount, p.amount)
        points.push({ts: p.client_timestamp, euro: Math.round(sum * 100) / 100})
    }
    return points
}

export interface StandingRow {
    key: string
    name: string
    pins: number
}

/**
 * Pins so far in the running game, per player — or per team for a team game with teams set up.
 * A player's score is their latest cumulative value, falling back to the sum of their pins (the same
 * rule the tablet overview uses). Highest first; empty when nothing has been thrown yet.
 */
export function gameStandings(evening: Evening | null, game: Game | null): StandingRow[] {
    if (!evening || !game || game.throws.length === 0) return []
    const perPlayer = new Map<number, number>()
    const byPlayer = new Map<number, typeof game.throws>()
    for (const th of game.throws) {
        if (th.player_id == null) continue
        const list = byPlayer.get(th.player_id) ?? []
        list.push(th)
        byPlayer.set(th.player_id, list)
    }
    for (const [pid, list] of byPlayer) {
        const sorted = [...list].sort((a, b) => a.throw_num - b.throw_num)
        const last = sorted[sorted.length - 1]
        perPlayer.set(pid, last.cumulative ?? sorted.reduce((s, th) => s + th.pins, 0))
    }
    let rows: StandingRow[]
    if (game.winner_type === 'team' && evening.teams.length > 0) {
        rows = evening.teams.map(team => ({
            key: `t:${team.id}`,
            name: team.name,
            pins: evening.players
                .filter(p => p.team_id === team.id)
                .reduce((s, p) => s + (perPlayer.get(p.id) ?? 0), 0),
        }))
    } else {
        rows = evening.players
            .filter(p => perPlayer.has(p.id))
            .map(p => ({key: `p:${p.id}`, name: displayName(p), pins: perPlayer.get(p.id)!}))
    }
    return rows.sort((a, b) => b.pins - a.pins || a.name.localeCompare(b.name))
}
