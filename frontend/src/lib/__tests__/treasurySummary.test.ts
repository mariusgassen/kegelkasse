import {describe, expect, it} from 'vitest'
import {paidShare, treasurySummary, writeOffOutstandingDebt} from '../treasurySummary'

const bal = (balance: number, payments_total: number, penalty_total: number) =>
    ({balance, payments_total, penalty_total})

const mbal = (id: number, balance: number, payments_total: number, penalty_total: number) =>
    ({regular_member_id: id, balance, payments_total, penalty_total})

describe('treasurySummary', () => {
    it('returns all zeros for empty inputs', () => {
        const s = treasurySummary([], [], [])
        expect(s).toEqual({
            paidIn: 0, expensesGross: 0, otherIncome: 0, expensesNet: 0, cashOnHand: 0,
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
        expect(s.expensesGross).toBe(42.5)
        expect(s.otherIncome).toBe(0)
        expect(s.expensesNet).toBe(42.5)
        expect(s.cashOnHand).toBe(57.5)
    })

    it('treats negative expenses as income (raises cash)', () => {
        const s = treasurySummary([bal(0, 50, 50)], [], [{amount: -20}])
        expect(s.expensesGross).toBe(0)
        expect(s.otherIncome).toBe(20)
        expect(s.expensesNet).toBe(-20)
        expect(s.cashOnHand).toBe(70)
    })

    it('keeps gross expenses and other income as separate positive figures', () => {
        const s = treasurySummary([bal(0, 100, 100)], [], [{amount: 40}, {amount: -15}, {amount: 5}])
        expect(s.expensesGross).toBe(45)
        expect(s.otherIncome).toBe(15)
        expect(s.expensesNet).toBe(30)
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
        expect(s.expensesGross).toBe(0.03)
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

describe('writeOffOutstandingDebt', () => {
    it('returns the same array when no members are selected', () => {
        const balances = [mbal(1, -5, 0, 5)]
        expect(writeOffOutstandingDebt(balances, [])).toBe(balances)
        expect(writeOffOutstandingDebt(balances, new Set())).toBe(balances)
    })

    it('drops outstanding debt of selected members to zero', () => {
        const result = writeOffOutstandingDebt([mbal(1, -12, 3, 15), mbal(2, 4, 9, 5)], [1])
        expect(result.find(b => b.regular_member_id === 1)?.balance).toBe(0)
        expect(result.find(b => b.regular_member_id === 2)?.balance).toBe(4)
    })

    it('leaves payments_total and penalty_total untouched', () => {
        const result = writeOffOutstandingDebt([mbal(1, -12, 3, 15)], [1])
        expect(result[0].payments_total).toBe(3)
        expect(result[0].penalty_total).toBe(15)
    })

    it('does not touch a selected member who is in credit', () => {
        const result = writeOffOutstandingDebt([mbal(1, 6, 10, 4)], [1])
        expect(result[0].balance).toBe(6)
    })

    it('leaves unselected members untouched', () => {
        const balances = [mbal(1, -5, 0, 5), mbal(2, -3, 0, 3)]
        const result = writeOffOutstandingDebt(balances, [1])
        expect(result[1]).toBe(balances[1])
    })

    it('accepts a Set or an array of ids', () => {
        const balances = [mbal(1, -5, 0, 5)]
        expect(writeOffOutstandingDebt(balances, new Set([1]))[0].balance).toBe(0)
        expect(writeOffOutstandingDebt(balances, [1])[0].balance).toBe(0)
    })

    it('feeds into treasurySummary to project outstanding/cash without the selected members', () => {
        const balances = [mbal(1, -20, 0, 20), mbal(2, -5, 0, 5)]
        const before = treasurySummary(balances, [], [])
        const after = treasurySummary(writeOffOutstandingDebt(balances, [1]), [], [])
        expect(before.outstanding).toBe(25)
        expect(after.outstanding).toBe(5)
        expect(before.projectedCash - after.projectedCash).toBe(20)
        expect(before.cashOnHand).toBe(after.cashOnHand)
    })
})
