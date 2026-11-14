import {describe, it, expect} from 'vitest'
import {cashFlowSegments, fill, maxAbs, penaltyScale, penaltySegments, runningBalance} from '@/lib/treasuryBars.ts'

describe('cashFlowSegments', () => {
    it('splits the inflow into spent and remaining, then appends what is owed', () => {
        expect(cashFlowSegments({paidIn: 300, otherIncome: 50, expensesGross: 100, outstanding: 40})).toEqual([
            {key: 'expenses', value: 100},
            {key: 'cash', value: 250},
            {key: 'outstanding', value: 40},
        ])
    })

    it('shows everything as spent when the till is in the red', () => {
        expect(cashFlowSegments({paidIn: 100, otherIncome: 0, expensesGross: 150, outstanding: 0})).toEqual([
            {key: 'expenses', value: 100},
            {key: 'cash', value: 0},
            {key: 'outstanding', value: 0},
        ])
    })
})

describe('penaltySegments', () => {
    it('splits penalties into paid and open', () => {
        expect(penaltySegments({balance: -30, penalty_total: 100})).toEqual([
            {key: 'paid', value: 70},
            {key: 'open', value: 30},
        ])
    })

    it('treats credit as fully paid', () => {
        expect(penaltySegments({balance: 20, penalty_total: 50})).toEqual([
            {key: 'paid', value: 50},
            {key: 'open', value: 0},
        ])
    })

    it('never goes negative when debt exceeds penalties (e.g. an entry fee)', () => {
        expect(penaltySegments({balance: -80, penalty_total: 50})).toEqual([
            {key: 'paid', value: 0},
            {key: 'open', value: 80},
        ])
    })
})

describe('scales', () => {
    it('penaltyScale is the longest bar in the list', () => {
        expect(penaltyScale([{balance: -10, penalty_total: 40}, {balance: -90, penalty_total: 60}])).toBe(90)
        expect(penaltyScale([])).toBe(0)
    })

    it('maxAbs ignores sign', () => {
        expect(maxAbs([3, -7, 5])).toBe(7)
        expect(maxAbs([])).toBe(0)
    })
})

describe('fill', () => {
    it('replaces every placeholder occurrence', () => {
        expect(fill('{a} und {b}, {a}', {a: 1, b: 'x'})).toBe('1 und x, 1')
    })
})

describe('runningBalance', () => {
    it('accumulates deltas oldest first, starting from zero', () => {
        expect(runningBalance([{ts: 3, delta: -5}, {ts: 1, delta: 10}])).toEqual([
            {ts: 1, balance: 0}, {ts: 1, balance: 10}, {ts: 3, balance: 5},
        ])
    })
    it('is empty without events', () => {
        expect(runningBalance([])).toEqual([])
    })
})
