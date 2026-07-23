import {describe, it, expect} from 'vitest'
import {
    penaltyEuro,
    currentGameState,
    buildEventFeed,
    eveningTotals,
} from '../liveEvening'
import type {Evening, EveningPlayer, Game, PenaltyLogEntry, DrinkRound, GameThrowLog} from '../../types'

function player(id: number, name: string, team_id: number | null = null): EveningPlayer {
    return {id, name, nickname: null, regular_member_id: null, team_id, is_king: false}
}

function throwLog(throw_num: number, pins: number, player_id: number | null, cumulative: number | null = null): GameThrowLog {
    return {id: throw_num, throw_num, pins, cumulative, pin_states: [], player_id}
}

function game(overrides: Partial<Game> = {}): Game {
    return {
        id: 1, name: 'Spiel', template_id: null, is_opener: false, winner_type: 'individual',
        turn_mode: 'alternating', winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0,
        per_point_penalty: 0, note: null, sort_order: 0, status: 'running', started_at: null,
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

function drink(id: number, overrides: Partial<DrinkRound> = {}): DrinkRound {
    return {id, drink_type: 'beer', variety: null, participant_ids: [], client_timestamp: 2000, ...overrides}
}

function evening(overrides: Partial<Evening> = {}): Evening {
    return {
        id: 1, date: '2026-07-23', venue: null, note: null, is_closed: false, ended_at: null,
        season_closed: false, players: [], teams: [], penalty_log: [], games: [], drink_rounds: [],
        highlights: [], ...overrides,
    }
}

describe('penaltyEuro', () => {
    it('returns amount for euro mode (no unit)', () => {
        expect(penaltyEuro(null, 2.5)).toBe(2.5)
    })
    it('multiplies count × unit for count mode', () => {
        expect(penaltyEuro(0.5, 3)).toBe(1.5)
    })
})

describe('currentGameState', () => {
    it('returns empties when there is no evening', () => {
        expect(currentGameState(null)).toEqual({game: null, activePlayer: null, nextPlayer: null, lastThrow: null})
    })

    it('returns empties when no game is running', () => {
        const ev = evening({games: [game({status: 'finished'})]})
        expect(currentGameState(ev).game).toBeNull()
    })

    it('picks the running game and its active player', () => {
        const ev = evening({
            players: [player(1, 'A'), player(2, 'B')],
            games: [game({status: 'running', active_player_id: 1})],
        })
        const st = currentGameState(ev)
        expect(st.game?.id).toBe(1)
        expect(st.activePlayer?.id).toBe(1)
    })

    it('computes the next player in alternating order (no teams)', () => {
        const ev = evening({
            players: [player(1, 'A'), player(2, 'B'), player(3, 'C')],
            games: [game({active_player_id: 2})],
        })
        expect(currentGameState(ev).nextPlayer?.id).toBe(3)
    })

    it('wraps the next player around to the first', () => {
        const ev = evening({
            players: [player(1, 'A'), player(2, 'B')],
            games: [game({active_player_id: 2})],
        })
        expect(currentGameState(ev).nextPlayer?.id).toBe(1)
    })

    it('surfaces the most recent throw with the thrower name', () => {
        const ev = evening({
            players: [player(1, 'A')],
            games: [game({active_player_id: 1, throws: [throwLog(1, 5, 1), throwLog(2, 9, 1, 14)]})],
        })
        const st = currentGameState(ev)
        expect(st.lastThrow).toEqual({pins: 9, cumulative: 14, playerName: 'A'})
    })

    it('has no next player when nobody is active', () => {
        const ev = evening({players: [player(1, 'A')], games: [game({active_player_id: null})]})
        expect(currentGameState(ev).nextPlayer).toBeNull()
    })
})

describe('buildEventFeed', () => {
    it('merges penalties, drinks and highlights newest-first', () => {
        const ev = evening({
            players: [player(1, 'A'), player(2, 'B')],
            penalty_log: [penalty(1, {client_timestamp: 1000})],
            drink_rounds: [drink(1, {client_timestamp: 3000, participant_ids: [1, 2]})],
            highlights: [{id: 1, text: 'Alle Neune!', media_url: null, created_at: '1970-01-01T00:00:02Z'}],
        })
        const feed = buildEventFeed(ev)
        expect(feed.map(e => e.kind)).toEqual(['drink', 'highlight', 'penalty'])
    })

    it('computes the euro amount for a count-mode penalty', () => {
        const ev = evening({penalty_log: [penalty(1, {mode: 'count', amount: 3, unit_amount: 0.5})]})
        expect(buildEventFeed(ev)[0].amount).toBe(1.5)
    })

    it('lists drink participants by name', () => {
        const ev = evening({
            players: [player(1, 'Rudi'), player(2, 'Otto')],
            drink_rounds: [drink(1, {participant_ids: [1, 2]})],
        })
        expect(buildEventFeed(ev)[0].subtitle).toBe('Rudi, Otto')
    })

    it('uses the shot glass icon for shots', () => {
        const ev = evening({drink_rounds: [drink(1, {drink_type: 'shots'})]})
        expect(buildEventFeed(ev)[0].icon).toBe('🥃')
    })

    it('caps the feed at the given limit', () => {
        const ev = evening({penalty_log: [penalty(1), penalty(2), penalty(3)]})
        expect(buildEventFeed(ev, 2)).toHaveLength(2)
    })

    it('produces stable unique keys across kinds', () => {
        const ev = evening({penalty_log: [penalty(1)], drink_rounds: [drink(1)]})
        const keys = buildEventFeed(ev).map(e => e.key)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('returns [] for a null evening', () => {
        expect(buildEventFeed(null)).toEqual([])
    })
})

describe('eveningTotals', () => {
    it('sums penalties and counts drink rounds and games', () => {
        const ev = evening({
            penalty_log: [penalty(1, {amount: 2}), penalty(2, {mode: 'count', amount: 2, unit_amount: 1})],
            drink_rounds: [drink(1, {drink_type: 'beer'}), drink(2, {drink_type: 'shots'}), drink(3, {drink_type: 'beer'})],
            games: [game({status: 'finished'}), game({id: 2, status: 'running'})],
        })
        expect(eveningTotals(ev)).toEqual({
            penaltyEuro: 4, beerRounds: 2, shotRounds: 1, gamesFinished: 1, gamesTotal: 2,
        })
    })

    it('returns zeros for a null evening', () => {
        expect(eveningTotals(null)).toEqual({penaltyEuro: 0, beerRounds: 0, shotRounds: 0, gamesFinished: 0, gamesTotal: 0})
    })
})
