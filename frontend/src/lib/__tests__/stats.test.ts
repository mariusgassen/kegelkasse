import {describe, expect, it} from 'vitest'
import {interpretR, linearRegression, pearson} from '../stats'

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
