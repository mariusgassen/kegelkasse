import {describe, expect, it} from 'vitest'
import {paidShare, treasurySummary} from '../treasurySummary'

const bal = (balance: number, payments_total: number, penalty_total: number) =>
    ({balance, payments_total, penalty_total})

describe('treasurySummary', () => {
    it('returns all zeros for empty inputs', () => {
        const s = treasurySummary([], [], [])
        expect(s).toEqual({
            paidIn: 0, expensesNet: 0, cashOnHand: 0,
            outstanding: 0, outstandingCount: 0,
            credit: 0, creditCount: 0, projectedCash: 0,
        })
    })

    it('sums paid-in across members and guests', () => {
        const s = treasurySummary(
            [bal(0, 10, 10), bal(5, 20, 15)],
            [bal(0, 3, 3)],
            [],
        )
        expect(s.paidIn).toBe(33)
    })

    it('computes cash on hand as paid-in minus net expenses', () => {
        const s = treasurySummary([bal(0, 100, 100)], [], [{amount: 30}, {amount: 12.5}])
        expect(s.expensesNet).toBe(42.5)
        expect(s.cashOnHand).toBe(57.5)
    })

    it('treats negative expenses as income (raises cash)', () => {
        const s = treasurySummary([bal(0, 50, 50)], [], [{amount: -20}])
        expect(s.expensesNet).toBe(-20)
        expect(s.cashOnHand).toBe(70)
    })

    it('collects outstanding debt from members and guests', () => {
        const s = treasurySummary(
            [bal(-5.5, 0, 5.5), bal(2, 7, 5)],
            [bal(-3, 0, 3)],
            [],
        )
        expect(s.outstanding).toBe(8.5)
        expect(s.outstandingCount).toBe(2)
    })

    it('counts credit only from member balances', () => {
        const s = treasurySummary(
            [bal(4, 9, 5), bal(-2, 0, 2)],
            [bal(1, 1, 0)],
            [],
        )
        expect(s.credit).toBe(4)
        expect(s.creditCount).toBe(1)
    })

    it('ignores balances within the ±0.01 epsilon', () => {
        const s = treasurySummary([bal(-0.01, 5, 5.01), bal(0.01, 5.01, 5)], [], [])
        expect(s.outstanding).toBe(0)
        expect(s.outstandingCount).toBe(0)
        expect(s.credit).toBe(0)
        expect(s.creditCount).toBe(0)
    })

    it('projects cash as cash on hand plus outstanding', () => {
        const s = treasurySummary(
            [bal(-10, 5, 15), bal(0, 20, 20)],
            [],
            [{amount: 8}],
        )
        expect(s.cashOnHand).toBe(17)
        expect(s.projectedCash).toBe(27)
    })

    it('rounds all monetary outputs to 2 decimals', () => {
        const s = treasurySummary([bal(-0.105, 0.1, 0.205)], [], [{amount: 0.033}])
        expect(s.paidIn).toBe(0.1)
        expect(s.expensesNet).toBe(0.03)
        expect(s.cashOnHand).toBe(0.07)
    })
})

describe('paidShare', () => {
    it('is null without penalties', () => {
        expect(paidShare({payments_total: 5, penalty_total: 0})).toBeNull()
        expect(paidShare({payments_total: 0, penalty_total: -1})).toBeNull()
    })

    it('returns the paid fraction of penalties', () => {
        expect(paidShare({payments_total: 5, penalty_total: 10})).toBe(0.5)
    })

    it('clamps to 0..1', () => {
        expect(paidShare({payments_total: 20, penalty_total: 10})).toBe(1)
        expect(paidShare({payments_total: -5, penalty_total: 10})).toBe(0)
    })
})
