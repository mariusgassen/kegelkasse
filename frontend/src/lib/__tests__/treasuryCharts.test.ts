import {describe, it, expect} from 'vitest'
import {treasurySummary} from '@/lib/treasurySummary.ts'
import {cashTrend, debtTiles, eveningBars, eventsInYear, flowTarget, paidOpenSplit, sankeyGraph, waterfallSteps} from '@/lib/treasuryCharts.ts'

const bal = (id: number, penalty: number, paid: number, name = `M${id}`) => ({
    regular_member_id: id, name, nickname: null, penalty_total: penalty, payments_total: paid, balance: paid - penalty,
})

describe('waterfallSteps', () => {
    it('chains paid in, expenses, cash, open debt and projected', () => {
        const s = treasurySummary([bal(1, 100, 60), bal(2, 50, 50)], [], [{amount: 30}])
        const steps = waterfallSteps(s)
        expect(steps.map(x => x.key)).toEqual(['paidIn', 'expenses', 'cash', 'outstanding', 'projected'])
        expect(steps[0].range).toEqual([0, 110])
        expect(steps[1].range).toEqual([80, 110])
        expect(steps[2]).toMatchObject({kind: 'total', amount: 80, range: [0, 80]})
        expect(steps[3].range).toEqual([80, 120])
        expect(steps[4].amount).toBe(120)
    })
    it('skips other income and open debt when zero and keeps negative cash drawable', () => {
        const s = treasurySummary([bal(1, 10, 10)], [], [{amount: 25}])
        const steps = waterfallSteps(s)
        expect(steps.map(x => x.key)).toEqual(['paidIn', 'expenses', 'cash'])
        expect(steps[2].range).toEqual([-15, 0])
    })
    it('adds other income from negative expenses', () => {
        const s = treasurySummary([bal(1, 10, 10)], [], [{amount: -20}])
        expect(waterfallSteps(s).map(x => x.key)).toContain('otherIncome')
    })
})

describe('debtTiles', () => {
    it('keeps only debtors, largest first, and flags the own account', () => {
        const tiles = debtTiles([bal(1, 10, 10), bal(2, 40, 0), bal(3, 20, 0)], 3)
        expect(tiles.map(t => t.id)).toEqual([2, 3])
        expect(tiles[1].isMe).toBe(true)
        expect(tiles[0].isMe).toBe(false)
    })
    it('prefers the nickname', () => {
        const tiles = debtTiles([{...bal(1, 5, 0), nickname: 'Pudel'}])
        expect(tiles[0].name).toBe('Pudel')
    })
})

describe('eveningBars', () => {
    it('sorts chronologically and rounds', () => {
        const bars = eveningBars([
            {id: 2, date: '2026-03-10T20:00:00', penalty_total: 12.345},
            {id: 1, date: '2026-02-03T20:00:00', penalty_total: 5},
        ])
        expect(bars.map(b => b.id)).toEqual([1, 2])
        expect(bars[1].penalty_total).toBe(12.35)
        expect(bars[0].label).toBe('03.02.')
    })
})

describe('sankeyGraph', () => {
    it('routes paid in to expenses and cash and open debt to unpaid', () => {
        const s = treasurySummary([bal(1, 100, 60)], [], [{amount: 20}])
        const g = sankeyGraph(s)
        const keyOf = (i: number) => g.nodes[i].key
        const flow = g.links.map(l => `${keyOf(l.source)}>${keyOf(l.target)}:${l.value}`).sort()
        expect(flow).toEqual(['outstanding>unpaid:40', 'paidIn>cash:40', 'paidIn>expenses:20'])
    })
    it('lets other income cover expenses beyond paid in', () => {
        const s = treasurySummary([bal(1, 5, 5)], [], [{amount: 8}, {amount: -10}])
        const g = sankeyGraph(s)
        const keyOf = (i: number) => g.nodes[i].key
        const flow = g.links.map(l => `${keyOf(l.source)}>${keyOf(l.target)}`)
        expect(flow).toContain('otherIncome>expenses')
    })
    it('is empty without money', () => {
        expect(sankeyGraph(treasurySummary([], [], [])).links).toEqual([])
    })
})

describe('paidOpenSplit', () => {
    it('counts only penalty-covered payments as paid', () => {
        expect(paidOpenSplit([bal(1, 100, 60), bal(2, 50, 80), bal(3, 0, 20)])).toEqual({paid: 110, open: 40})
    })
})

describe('cashTrend', () => {
    it('accumulates in time order', () => {
        const t = cashTrend([{ts: 3, delta: -5}, {ts: 1, delta: 10}, {ts: 2, delta: 5}])
        expect(t.map(p => p.value)).toEqual([10, 15, 10])
    })
    it('downsamples keeping first and last', () => {
        const ev = Array.from({length: 200}, (_, i) => ({ts: i, delta: 1}))
        const t = cashTrend(ev, 20)
        expect(t).toHaveLength(20)
        expect(t[0].value).toBe(1)
        expect(t[19].value).toBe(200)
    })
})

describe('flowTarget / eventsInYear', () => {
    it('maps flows to the matching Kasse tab', () => {
        expect(flowTarget('paidIn')).toEqual({tab: 'bookings'})
        expect(flowTarget('expenses')).toEqual({tab: 'bookings'})
        expect(flowTarget('outstanding')).toEqual({tab: 'accounts'})
        expect(flowTarget('unpaid')).toEqual({tab: 'accounts'})
        expect(flowTarget('cash')).toBeNull()
    })
    it('filters events by calendar year, null keeps all', () => {
        const ev = [{ts: new Date(2025, 5, 1).getTime()}, {ts: new Date(2026, 5, 1).getTime()}]
        expect(eventsInYear(ev, 2026)).toHaveLength(1)
        expect(eventsInYear(ev, null)).toHaveLength(2)
    })
})
