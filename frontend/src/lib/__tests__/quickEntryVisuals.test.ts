import {describe, expect, it} from 'vitest'
import {drinkTimeline, penaltyTypeCounts} from '../quickEntryVisuals'
import type {DrinkRound, PenaltyLogEntry} from '@/types.ts'

function entry(over: Partial<PenaltyLogEntry>): PenaltyLogEntry {
    return {
        id: 1, player_id: 1, team_id: null, player_name: 'A', penalty_type_name: 'Pudel', icon: '🐩',
        amount: 1, mode: 'count', unit_amount: 0.5, regular_member_id: null, game_id: null,
        client_timestamp: 0, ...over,
    }
}

function round(id: number, t: number, type: DrinkRound['drink_type'] = 'beer', n = 2): DrinkRound {
    return {id, drink_type: type, variety: null, participant_ids: Array.from({length: n}, (_, i) => i + 1), client_timestamp: t}
}

describe('penaltyTypeCounts', () => {
    it('counts entries per penalty name, using amount for count mode', () => {
        const c = penaltyTypeCounts([
            entry({id: 1}),
            entry({id: 2, amount: 3}),
            entry({id: 3, penalty_type_name: 'Kranz', mode: 'euro', amount: 2.5}),
        ])
        expect(c.get('Pudel')).toBe(4)
        expect(c.get('Kranz')).toBe(1)
    })

    it('ignores absence entries and automatic loser penalties', () => {
        const c = penaltyTypeCounts([
            entry({id: 1, player_id: null}),
            entry({id: 2, game_id: 7}),
        ])
        expect(c.size).toBe(0)
    })
})

describe('drinkTimeline', () => {
    it('returns null without rounds', () => {
        expect(drinkTimeline([], 1000)).toBeNull()
    })

    it('spreads rounds from the first round to now', () => {
        const tl = drinkTimeline([round(2, 500, 'shots', 4), round(1, 0)], 1000)!
        expect(tl.start).toBe(0)
        expect(tl.end).toBe(1000)
        expect(tl.points.map(p => [p.id, p.left])).toEqual([[1, 0], [2, 50]])
        expect(tl.maxSize).toBe(4)
    })

    it('centres a single round and tolerates a round newer than now', () => {
        expect(drinkTimeline([round(1, 100)], 100)!.points[0].left).toBe(50)
        const tl = drinkTimeline([round(1, 0), round(2, 2000)], 1000)!
        expect(tl.end).toBe(2000)
        expect(tl.points[1].left).toBe(100)
    })
})
