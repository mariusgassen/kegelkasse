import {describe, expect, it} from 'vitest'
import {computeHallOfShame, interpretR, linearRegression, pearson, type ShamePlayer} from '../stats'

describe('pearson', () => {
    it('returns null for n < 3', () => {
        expect(pearson([1, 2], [1, 2])).toBeNull()
        expect(pearson([1], [1])).toBeNull()
        expect(pearson([], [])).toBeNull()
    })

    it('returns null for mismatched lengths', () => {
        expect(pearson([1, 2, 3], [1, 2])).toBeNull()
    })

    it('returns null for zero variance on x', () => {
        expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull()
    })

    it('returns null for zero variance on y', () => {
        expect(pearson([1, 2, 3], [7, 7, 7])).toBeNull()
    })

    it('returns 1 for perfect positive correlation', () => {
        expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1)
    })

    it('returns -1 for perfect negative correlation', () => {
        expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1)
    })

    it('returns a value in [-1, 1] for mid-range data', () => {
        const r = pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])
        expect(r).not.toBeNull()
        expect(r!).toBeGreaterThan(0)
        expect(r!).toBeLessThan(1)
    })
})

describe('linearRegression', () => {
    it('returns null for fewer than 2 points', () => {
        expect(linearRegression([])).toBeNull()
        expect(linearRegression([{x: 1, y: 1}])).toBeNull()
    })

    it('returns null when all x are equal (vertical line)', () => {
        expect(linearRegression([
            {x: 1, y: 1},
            {x: 1, y: 2},
            {x: 1, y: 3},
        ])).toBeNull()
    })

    it('fits y = 2x + 1', () => {
        const result = linearRegression([
            {x: 0, y: 1},
            {x: 1, y: 3},
            {x: 2, y: 5},
            {x: 3, y: 7},
        ])
        expect(result).not.toBeNull()
        expect(result!.slope).toBeCloseTo(2, 5)
        expect(result!.intercept).toBeCloseTo(1, 5)
    })
})

describe('interpretR', () => {
    it('returns none for null', () => {
        expect(interpretR(null)).toBe('none')
    })
    it('returns strong for |r| >= 0.5', () => {
        expect(interpretR(0.5)).toBe('strong')
        expect(interpretR(-0.9)).toBe('strong')
    })
    it('returns moderate for 0.2 <= |r| < 0.5', () => {
        expect(interpretR(0.3)).toBe('moderate')
        expect(interpretR(-0.2)).toBe('moderate')
    })
    it('returns weak for |r| < 0.2', () => {
        expect(interpretR(0.1)).toBe('weak')
        expect(interpretR(0)).toBe('weak')
    })
})

describe('computeHallOfShame', () => {
    const player = (overrides: Partial<ShamePlayer>): ShamePlayer => ({
        name: 'X', nickname: null, regular_member_id: 1,
        evenings: 5, penalty_total: 0, game_wins: 1,
        beer_rounds: 0, shot_rounds: 0, avg_pins: null, throw_count: 0,
        ...overrides,
    })

    it('returns an empty array for no players', () => {
        expect(computeHallOfShame([])).toEqual([])
    })

    it('picks the highest penalty-per-evening rate among eligible players', () => {
        const a = player({name: 'A', evenings: 3, penalty_total: 30})
        const b = player({name: 'B', evenings: 10, penalty_total: 50})
        const result = computeHallOfShame([a, b])
        const rate = result.find(e => e.key === 'rate')
        expect(rate?.player.name).toBe('A')
        expect(rate?.rawValue).toBe(10)
    })

    it('omits the rate category when nobody has enough evenings', () => {
        const a = player({evenings: 1, penalty_total: 100})
        const result = computeHallOfShame([a])
        expect(result.find(e => e.key === 'rate')).toBeUndefined()
    })

    it('picks the highest combined drink count for thirst', () => {
        const a = player({name: 'A', beer_rounds: 2, shot_rounds: 1})
        const b = player({name: 'B', beer_rounds: 5, shot_rounds: 0})
        const result = computeHallOfShame([a, b])
        const thirst = result.find(e => e.key === 'thirst')
        expect(thirst?.player.name).toBe('B')
        expect(thirst?.rawValue).toBe(5)
    })

    it('omits thirst when nobody has any drinks', () => {
        const a = player({beer_rounds: 0, shot_rounds: 0})
        const result = computeHallOfShame([a])
        expect(result.find(e => e.key === 'thirst')).toBeUndefined()
    })

    it('picks the lowest avg_pins among players with enough throws', () => {
        const a = player({name: 'A', throw_count: 12, avg_pins: 4.2})
        const b = player({name: 'B', throw_count: 15, avg_pins: 6.1})
        const result = computeHallOfShame([a, b])
        const worst = result.find(e => e.key === 'worstThrow')
        expect(worst?.player.name).toBe('A')
        expect(worst?.rawValue).toBe(4.2)
    })

    it('omits worstThrow when nobody has enough throws', () => {
        const a = player({throw_count: 3, avg_pins: 4.0})
        const result = computeHallOfShame([a])
        expect(result.find(e => e.key === 'worstThrow')).toBeUndefined()
    })

    it('picks the player with most evenings and zero wins for bridesmaid', () => {
        const a = player({name: 'A', evenings: 4, game_wins: 0})
        const b = player({name: 'B', evenings: 8, game_wins: 0})
        const c = player({name: 'C', evenings: 20, game_wins: 3})
        const result = computeHallOfShame([a, b, c])
        const bridesmaid = result.find(e => e.key === 'bridesmaid')
        expect(bridesmaid?.player.name).toBe('B')
        expect(bridesmaid?.rawValue).toBe(8)
    })

    it('omits bridesmaid when everyone has at least one win', () => {
        const a = player({game_wins: 1})
        const result = computeHallOfShame([a])
        expect(result.find(e => e.key === 'bridesmaid')).toBeUndefined()
    })
})
