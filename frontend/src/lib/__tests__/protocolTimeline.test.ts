import {describe, it, expect} from 'vitest'
import {buildPenaltyTimeline, gameBandColor, gameBandIndex, gamesWithPenalties, hasManualPenalties} from '../protocolTimeline'
import type {Evening, Game, PenaltyLogEntry} from '../../types'

function game(id: number, overrides: Partial<Game> = {}): Game {
    return {
        id, name: `Spiel ${id}`, template_id: null, is_opener: false, winner_type: 'individual',
        turn_mode: 'alternating', winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0,
        per_point_penalty: 0, note: null, sort_order: 0, status: 'finished', started_at: null,
        finished_at: null, client_timestamp: 0, active_player_id: null, throws: [], ...overrides,
    }
}

function penalty(id: number, overrides: Partial<PenaltyLogEntry> = {}): PenaltyLogEntry {
    return {
        id, player_id: 1, team_id: null, player_name: 'Rudi', penalty_type_name: 'Pudel', icon: '🎳',
        amount: 1, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null,
        client_timestamp: 1000, ...overrides,
    }
}

function evening(overrides: Partial<Evening> = {}): Evening {
    return {
        id: 1, date: '2026-07-23', venue: null, note: null, is_closed: true, ended_at: null,
        season_closed: false, players: [], teams: [], penalty_log: [], games: [], drink_rounds: [],
        highlights: [], ...overrides,
    }
}

describe('buildPenaltyTimeline', () => {
    it('returns penalty entries newest-first', () => {
        const ev = evening({penalty_log: [
            penalty(1, {client_timestamp: 1000}),
            penalty(2, {client_timestamp: 2000}),
        ]})
        const timeline = buildPenaltyTimeline(ev)
        expect(timeline.map(e => e.kind === 'penalty' ? e.entry.id : null)).toEqual([2, 1])
    })

    it('adds game start/finish dividers sorted into the timeline', () => {
        const ev = evening({
            penalty_log: [penalty(1, {client_timestamp: 1500})],
            games: [game(1, {
                started_at: '1970-01-01T00:00:01Z',
                finished_at: '1970-01-01T00:00:02Z',
            })],
        })
        const timeline = buildPenaltyTimeline(ev)
        expect(timeline.map(e => e.kind)).toEqual(['game_finished', 'penalty', 'game_started'])
    })

    it('resolves the game name on a penalty tied to a game', () => {
        const ev = evening({
            penalty_log: [penalty(1, {game_id: 5})],
            games: [game(5, {name: 'Bundeskegeln'})],
        })
        expect(buildPenaltyTimeline(ev)[0]).toMatchObject({gameName: 'Bundeskegeln'})
    })

    it('leaves gameName null for a manual (non-game) entry', () => {
        const ev = evening({penalty_log: [penalty(1, {game_id: null})]})
        expect(buildPenaltyTimeline(ev)[0]).toMatchObject({gameName: null})
    })

    it('filters by player', () => {
        const ev = evening({penalty_log: [
            penalty(1, {player_id: 1, player_name: 'Rudi'}),
            penalty(2, {player_id: 2, player_name: 'Otto'}),
        ]})
        const timeline = buildPenaltyTimeline(ev, {filterPlayerId: 2})
        expect(timeline).toHaveLength(1)
        expect(timeline[0]).toMatchObject({kind: 'penalty', entry: {player_name: 'Otto'}})
    })

    it('drops game dividers when a player filter is active', () => {
        const ev = evening({
            penalty_log: [penalty(1, {player_id: 1})],
            games: [game(1, {started_at: '1970-01-01T00:00:01Z'})],
        })
        const timeline = buildPenaltyTimeline(ev, {filterPlayerId: 1})
        expect(timeline.every(e => e.kind === 'penalty')).toBe(true)
    })

    it('filters by game', () => {
        const ev = evening({penalty_log: [
            penalty(1, {game_id: 1}),
            penalty(2, {game_id: 2}),
        ]})
        const timeline = buildPenaltyTimeline(ev, {filterGameId: 1})
        expect(timeline.map(e => e.kind === 'penalty' ? e.entry.id : null)).toEqual([1])
    })

    it('filters to manual (non-game) entries with gameId -1', () => {
        const ev = evening({penalty_log: [
            penalty(1, {game_id: 1}),
            penalty(2, {game_id: null}),
        ]})
        const timeline = buildPenaltyTimeline(ev, {filterGameId: -1})
        expect(timeline.map(e => e.kind === 'penalty' ? e.entry.id : null)).toEqual([2])
    })
})

describe('gamesWithPenalties', () => {
    it('only returns games that have at least one penalty entry', () => {
        const ev = evening({
            games: [game(1), game(2)],
            penalty_log: [penalty(1, {game_id: 1})],
        })
        expect(gamesWithPenalties(ev).map(g => g.id)).toEqual([1])
    })
})

describe('hasManualPenalties', () => {
    it('is true when any entry has no game_id', () => {
        expect(hasManualPenalties(evening({penalty_log: [penalty(1, {game_id: null})]}))).toBe(true)
    })

    it('is false when every entry belongs to a game', () => {
        expect(hasManualPenalties(evening({penalty_log: [penalty(1, {game_id: 1})]}))).toBe(false)
    })
})

describe('gameBandIndex', () => {
    const iso = (ms: number) => new Date(ms).toISOString()
    const games = [
        game(2, {started_at: iso(5000), finished_at: null}),
        game(1, {started_at: iso(1000), finished_at: iso(3000)}),
        game(3, {started_at: null}),
    ]

    it('numbers games in start order and uses game_id when present', () => {
        expect(gameBandIndex(games, 0, 1)).toBe(0)
        expect(gameBandIndex(games, 0, 2)).toBe(1)
        expect(gameBandIndex(games, 0, 3)).toBeNull()
    })

    it('finds the game running at the timestamp', () => {
        expect(gameBandIndex(games, 2000, null)).toBe(0)
        expect(gameBandIndex(games, 4000, null)).toBeNull()
        expect(gameBandIndex(games, 9000, null)).toBe(1)
    })

    it('cycles through the six team colours', () => {
        expect(gameBandColor(0)).toBe('var(--team-0)')
        expect(gameBandColor(7)).toBe('var(--team-1)')
    })
})
