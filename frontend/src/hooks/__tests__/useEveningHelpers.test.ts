/**
 * Tests for useEvening pure helper functions: penaltyTotal, playerBeerCount, playerShotsCount
 */
import { describe, it, expect } from 'vitest'
import { penaltyTotal, playerBeerCount, playerShotsCount } from '../useEvening'

// Minimal Evening shape for testing helpers
function makeEvening(overrides: any = {}) {
    return {
        id: 1,
        date: '2025-01-01',
        venue: 'Test',
        note: null,
        is_closed: false,
        players: [],
        teams: [],
        games: [],
        highlights: [],
        penalty_log: overrides.penalty_log ?? [],
        drink_rounds: overrides.drink_rounds ?? [],
    }
}

// ── penaltyTotal ──────────────────────────────────────────────────────────────

describe('penaltyTotal', () => {
    it('returns 0 when evening is null', () => {
        expect(penaltyTotal(null, 1)).toBe(0)
    })

    it('returns 0 when evening is undefined', () => {
        expect(penaltyTotal(undefined, 1)).toBe(0)
    })

    it('returns 0 when no penalty_log entries', () => {
        expect(penaltyTotal(makeEvening() as any, 1)).toBe(0)
    })

    it('sums euro mode penalties for given player', () => {
        const evening = makeEvening({
            penalty_log: [
                { player_id: 1, mode: 'euro', amount: 2.5 },
                { player_id: 1, mode: 'euro', amount: 1.0 },
            ],
        })
        expect(penaltyTotal(evening as any, 1)).toBeCloseTo(3.5)
    })

    it('ignores penalties for other players', () => {
        const evening = makeEvening({
            penalty_log: [
                { player_id: 1, mode: 'euro', amount: 2.5 },
                { player_id: 2, mode: 'euro', amount: 5.0 },
            ],
        })
        expect(penaltyTotal(evening as any, 1)).toBeCloseTo(2.5)
    })

    it('ignores count-mode penalties', () => {
        const evening = makeEvening({
            penalty_log: [
                { player_id: 1, mode: 'euro', amount: 2.0 },
                { player_id: 1, mode: 'count', amount: 1.0 },
            ],
        })
        expect(penaltyTotal(evening as any, 1)).toBeCloseTo(2.0)
    })

    it('returns 0 when player has no matching entries', () => {
        const evening = makeEvening({
            penalty_log: [
                { player_id: 2, mode: 'euro', amount: 5.0 },
            ],
        })
        expect(penaltyTotal(evening as any, 1)).toBe(0)
    })
})

// ── playerBeerCount ──────────────────────────────────────────────────────────

describe('playerBeerCount', () => {
    it('returns 0 when evening is null', () => {
        expect(playerBeerCount(null, 1)).toBe(0)
    })

    it('returns 0 when no drink rounds', () => {
        expect(playerBeerCount(makeEvening() as any, 1)).toBe(0)
    })

    it('counts beer rounds for given player', () => {
        const evening = makeEvening({
            drink_rounds: [
                { drink_type: 'beer', participant_ids: [1, 2] },
                { drink_type: 'beer', participant_ids: [1] },
                { drink_type: 'beer', participant_ids: [2] },
            ],
        })
        expect(playerBeerCount(evening as any, 1)).toBe(2)
    })

    it('ignores shots rounds', () => {
        const evening = makeEvening({
            drink_rounds: [
                { drink_type: 'beer', participant_ids: [1] },
                { drink_type: 'shots', participant_ids: [1] },
            ],
        })
        expect(playerBeerCount(evening as any, 1)).toBe(1)
    })

    it('returns 0 when player not in any beer round', () => {
        const evening = makeEvening({
            drink_rounds: [
                { drink_type: 'beer', participant_ids: [2, 3] },
            ],
        })
        expect(playerBeerCount(evening as any, 1)).toBe(0)
    })
})

// ── playerShotsCount ──────────────────────────────────────────────────────────

describe('playerShotsCount', () => {
    it('returns 0 when evening is null', () => {
        expect(playerShotsCount(null, 1)).toBe(0)
    })

    it('returns 0 when no drink rounds', () => {
        expect(playerShotsCount(makeEvening() as any, 1)).toBe(0)
    })

    it('counts shots rounds for given player', () => {
        const evening = makeEvening({
            drink_rounds: [
                { drink_type: 'shots', participant_ids: [1, 2] },
                { drink_type: 'shots', participant_ids: [1] },
                { drink_type: 'shots', participant_ids: [2] },
            ],
        })
        expect(playerShotsCount(evening as any, 1)).toBe(2)
    })

    it('ignores beer rounds', () => {
        const evening = makeEvening({
            drink_rounds: [
                { drink_type: 'shots', participant_ids: [1] },
                { drink_type: 'beer', participant_ids: [1] },
            ],
        })
        expect(playerShotsCount(evening as any, 1)).toBe(1)
    })
})
