/**
 * Pure helpers for the live evening cockpit (#65, "Abend-Modus").
 *
 * The Live view is a read-only, always-fresh cockpit over the active evening (the
 * `useActiveEvening` hook already keeps `Evening` live via SSE + polling). These functions
 * derive the scoreboard state and the chronological event ticker so the view stays a thin
 * component and the logic is unit-testable.
 *
 * Note on the ticker: penalties, drink rounds and highlights carry timestamps
 * (`client_timestamp` / `created_at`), so they interleave chronologically. Individual throws do
 * not carry a per-throw timestamp in the API, so they are surfaced in the scoreboard header (the
 * live throw state) rather than faked into the chronological feed.
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

export type LiveEventKind = 'penalty' | 'drink' | 'highlight'

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

/**
 * Build the chronological event ticker (newest first) from penalties, drink rounds and
 * highlights. Capped at `limit`. Player/participant names use the Kegelname convention.
 */
export function buildEventFeed(evening: Evening | null, limit = 30): LiveEvent[] {
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
            title: d.variety || (d.drink_type === 'shots' ? 'Schnaps' : 'Bier'),
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
