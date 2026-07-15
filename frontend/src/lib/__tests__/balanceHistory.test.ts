import {describe, expect, it} from 'vitest'
import {
    bucketStart,
    clubEventsFromBookings,
    clusterPoints,
    cumulativeBaseline,
    debtEventsFromTimeline,
    eventsInWindow,
    formatTick,
    isAttributable,
    memberPaymentEvents,
    memberPenaltyEvents,
    mergeDualSeries,
    windowBounds,
    type BalanceEventKind,
    type DualPoint,
} from '../balanceHistory'

describe('clubEventsFromBookings', () => {
    it('signs payments positive and expenses negative', () => {
        const events = clubEventsFromBookings(
            [{id: 1, regular_member_id: 5, member_name: 'Anna', amount: 20, note: null, created_at: '2024-05-01T10:00:00Z'}],
            [{id: 2, amount: 15, description: 'Bälle', created_at: '2024-05-02T10:00:00Z', date: null}],
        )
        expect(events).toHaveLength(2)
        expect(events[0]).toMatchObject({id: 'payment-1', delta: 20, kind: 'payment', label: 'Anna'})
        expect(events[1]).toMatchObject({id: 'expense-2', delta: -15, kind: 'expense', label: 'Bälle'})
    })

    it('prefers expense.date over expense.created_at for timestamp', () => {
        const events = clubEventsFromBookings([], [
            {id: 1, amount: 10, description: 'X', created_at: '2024-06-01T00:00:00Z', date: '2024-05-01T00:00:00Z'},
        ])
        expect(events[0].ts).toBe(new Date('2024-05-01T00:00:00Z').getTime())
    })

    it('skips events with unparseable or missing timestamps', () => {
        const events = clubEventsFromBookings(
            [{id: 1, regular_member_id: 1, member_name: 'X', amount: 5, note: null, created_at: null}],
            [{id: 2, amount: 5, description: 'Y', created_at: null, date: null}],
        )
        expect(events).toHaveLength(0)
    })

    it('sorts the merged stream chronologically', () => {
        const events = clubEventsFromBookings(
            [{id: 1, regular_member_id: 1, member_name: 'A', amount: 1, note: null, created_at: '2024-06-01T00:00:00Z'}],
            [{id: 2, amount: 1, description: 'B', created_at: null, date: '2024-01-01T00:00:00Z'}],
        )
        expect(events.map(e => e.id)).toEqual(['expense-2', 'payment-1'])
    })
})

describe('memberPaymentEvents', () => {
    it('signs payments positive and falls back to empty label', () => {
        const events = memberPaymentEvents([
            {id: 1, amount: 30, note: null, created_at: '2024-05-01T00:00:00Z'},
            {id: 2, amount: 10, note: 'Beitrag', created_at: '2024-05-02T00:00:00Z'},
        ])
        expect(events[0]).toMatchObject({id: 'payment-1', delta: 30, label: ''})
        expect(events[1]).toMatchObject({id: 'payment-2', delta: 10, label: 'Beitrag'})
    })

    it('skips null timestamps', () => {
        expect(memberPaymentEvents([{id: 1, amount: 1, note: null, created_at: null}])).toHaveLength(0)
    })
})

describe('memberPenaltyEvents', () => {
    it('signs penalties negative and carries the icon', () => {
        const events = memberPenaltyEvents([
            {id: 9, amount: 5, icon: '🍺', penalty_type_name: 'Zu spät', evening_id: 1, evening_date: null, is_absence: false, created_at: '2024-05-01T00:00:00Z'},
        ])
        expect(events[0]).toMatchObject({id: 'penalty-9', delta: -5, kind: 'penalty', label: 'Zu spät', icon: '🍺'})
    })
})

describe('debtEventsFromTimeline', () => {
    it('diffs consecutive checkpoint levels into deltas', () => {
        const events = debtEventsFromTimeline([
            {ts: '2024-01-01T00:00:00Z', total_debt: 10},
            {ts: '2024-02-01T00:00:00Z', total_debt: 25},
            {ts: '2024-03-01T00:00:00Z', total_debt: 15},
        ])
        expect(events.map(e => e.delta)).toEqual([10, 15, -10])
        expect(events.every(e => e.kind === 'debt')).toBe(true)
    })

    it('skips checkpoints with unparseable timestamps but keeps prior level for the next diff', () => {
        const events = debtEventsFromTimeline([
            {ts: '2024-01-01T00:00:00Z', total_debt: 10},
            {ts: 'not-a-date', total_debt: 999},
            {ts: '2024-03-01T00:00:00Z', total_debt: 30},
        ])
        expect(events.map(e => e.delta)).toEqual([10, 20])
    })

    it('returns an empty array for no checkpoints', () => {
        expect(debtEventsFromTimeline([])).toEqual([])
    })

    it('labels each event with the attributed member name when supplied', () => {
        const events = debtEventsFromTimeline([
            {ts: '2024-01-01T00:00:00Z', total_debt: 10, member_name: 'Anna'},
            {ts: '2024-02-01T00:00:00Z', total_debt: 25, member_name: 'Ben'},
        ])
        expect(events.map(e => e.label)).toEqual(['Anna', 'Ben'])
    })

    it('falls back to an empty label when no member name is attributed', () => {
        const events = debtEventsFromTimeline([{ts: '2024-01-01T00:00:00Z', total_debt: 10}])
        expect(events[0].label).toBe('')
    })
})

describe('isAttributable', () => {
    it('is false only for debt-kind events', () => {
        expect(isAttributable({id: '1', ts: 0, delta: 1, kind: 'debt', label: ''})).toBe(false)
        expect(isAttributable({id: '2', ts: 0, delta: 1, kind: 'payment', label: ''})).toBe(true)
        expect(isAttributable({id: '3', ts: 0, delta: 1, kind: 'expense', label: ''})).toBe(true)
        expect(isAttributable({id: '4', ts: 0, delta: 1, kind: 'penalty', label: ''})).toBe(true)
    })
})

describe('windowBounds', () => {
    it('computes month bounds and a German label', () => {
        const anchor = new Date(2024, 4, 15)
        const {start, end, label} = windowBounds('month', anchor, [])
        expect(start).toBe(new Date(2024, 4, 1).getTime())
        expect(end).toBe(new Date(2024, 5, 1).getTime())
        expect(label).toBe('Mai 2024')
    })

    it('computes year bounds and a year label', () => {
        const anchor = new Date(2024, 4, 15)
        const {start, end, label} = windowBounds('year', anchor, [])
        expect(start).toBe(new Date(2024, 0, 1).getTime())
        expect(end).toBe(new Date(2025, 0, 1).getTime())
        expect(label).toBe('2024')
    })

    it('computes all-time bounds spanning from the earliest event to now', () => {
        const events = [
            {id: '1', ts: new Date('2020-01-01').getTime(), delta: 1, kind: 'payment' as const, label: ''},
            {id: '2', ts: new Date('2021-01-01').getTime(), delta: 1, kind: 'payment' as const, label: ''},
        ]
        const {start, end} = windowBounds('all', new Date(), events)
        expect(start).toBe(events[0].ts)
        expect(end).toBeGreaterThanOrEqual(Date.now() - 1000)
    })

    it('falls back to the anchor when there are no events for all-time', () => {
        const anchor = new Date(2024, 0, 1)
        const {start} = windowBounds('all', anchor, [])
        expect(start).toBe(anchor.getTime())
    })
})

describe('cumulativeBaseline', () => {
    it('sums only deltas strictly before the window start', () => {
        const events = [
            {id: '1', ts: 100, delta: 10, kind: 'payment' as const, label: ''},
            {id: '2', ts: 200, delta: -5, kind: 'expense' as const, label: ''},
            {id: '3', ts: 300, delta: 7, kind: 'payment' as const, label: ''},
        ]
        expect(cumulativeBaseline(events, 200)).toBe(10)
        expect(cumulativeBaseline(events, 0)).toBe(0)
        expect(cumulativeBaseline(events, 301)).toBe(12)
    })
})

describe('eventsInWindow', () => {
    it('filters to [start, end) and sorts ascending', () => {
        const events = [
            {id: '2', ts: 200, delta: 1, kind: 'payment' as const, label: ''},
            {id: '1', ts: 100, delta: 1, kind: 'payment' as const, label: ''},
            {id: '3', ts: 300, delta: 1, kind: 'payment' as const, label: ''},
        ]
        expect(eventsInWindow(events, 100, 300).map(e => e.id)).toEqual(['1', '2'])
    })
})

describe('mergeDualSeries', () => {
    it('interleaves chronologically, keeping the other line flat between its own events', () => {
        const actual = [
            {id: 'a1', ts: 100, delta: 10, kind: 'payment' as const, label: ''},
            {id: 'a2', ts: 300, delta: 5, kind: 'payment' as const, label: ''},
        ]
        const overlay = [
            {id: 'o1', ts: 200, delta: -3, kind: 'penalty' as const, label: ''},
        ]
        const points = mergeDualSeries(actual, overlay, 0, 0)
        expect(points).toHaveLength(3)
        expect(points[0]).toMatchObject({ts: 100, actual: 10, virtual: 10})
        expect(points[1]).toMatchObject({ts: 200, actual: 10, virtual: 7})
        expect(points[2]).toMatchObject({ts: 300, actual: 15, virtual: 12})
    })

    it('applies baselines as the starting running totals', () => {
        const points = mergeDualSeries(
            [{id: 'a1', ts: 100, delta: 5, kind: 'payment', label: ''}],
            [],
            50,
            -20,
        )
        expect(points[0]).toMatchObject({actual: 55, virtual: 35})
    })

    it('breaks ties at equal timestamps in favor of the actual stream', () => {
        const points = mergeDualSeries(
            [{id: 'a1', ts: 100, delta: 1, kind: 'payment', label: ''}],
            [{id: 'o1', ts: 100, delta: -1, kind: 'penalty', label: ''}],
            0,
            0,
        )
        expect(points[0].event!.id).toBe('a1')
        expect(points[1].event!.id).toBe('o1')
    })

    it('returns an empty array when both streams are empty', () => {
        expect(mergeDualSeries([], [], 0, 0)).toEqual([])
    })
})

describe('formatTick', () => {
    const ts = new Date(2024, 4, 7).getTime()

    it('formats day.month for month granularity', () => {
        expect(formatTick(ts, 'month')).toBe('07.05.')
    })

    it('formats short month for year granularity', () => {
        expect(formatTick(ts, 'year')).toBe('Mai')
    })

    it('formats short month + 2-digit year for all granularity', () => {
        expect(formatTick(ts, 'all')).toBe('Mai 24')
    })
})

describe('bucketStart', () => {
    it('buckets to the start of the calendar day for month granularity', () => {
        const ts = new Date(2024, 4, 7, 21, 30).getTime()
        expect(bucketStart(ts, 'month')).toBe(new Date(2024, 4, 7).getTime())
    })

    it('collapses multiple same-day events onto one bucket for month granularity', () => {
        const morning = new Date(2024, 4, 7, 9, 0).getTime()
        const evening = new Date(2024, 4, 7, 22, 0).getTime()
        expect(bucketStart(morning, 'month')).toBe(bucketStart(evening, 'month'))
    })

    it('buckets to the start of the calendar month for year granularity', () => {
        const ts = new Date(2024, 4, 17, 21, 30).getTime()
        expect(bucketStart(ts, 'year')).toBe(new Date(2024, 4, 1).getTime())
    })

    it('collapses multiple same-month events onto one bucket for year granularity', () => {
        const early = new Date(2024, 4, 2).getTime()
        const late = new Date(2024, 4, 28).getTime()
        expect(bucketStart(early, 'year')).toBe(bucketStart(late, 'year'))
    })

    it('buckets to the start of the calendar day for all granularity (same as month)', () => {
        const ts = new Date(2024, 4, 7, 21, 30).getTime()
        expect(bucketStart(ts, 'all')).toBe(new Date(2024, 4, 7).getTime())
    })

    it('collapses multiple same-day events onto one bucket for all granularity', () => {
        const morning = new Date(2024, 4, 7, 9, 0).getTime()
        const evening = new Date(2024, 4, 7, 22, 0).getTime()
        expect(bucketStart(morning, 'all')).toBe(bucketStart(evening, 'all'))
    })
})

describe('clusterPoints', () => {
    const morning = new Date(2024, 4, 7, 9, 0).getTime()
    const evening = new Date(2024, 4, 7, 22, 0).getTime()
    const otherDay = new Date(2024, 4, 8, 9, 0).getTime()

    function point(ts: number, event: {id: string; kind: BalanceEventKind}): DualPoint {
        return {ts, actual: 0, virtual: 0, event: {id: event.id, ts, delta: 1, kind: event.kind, label: ''}}
    }

    it('merges same-day, same-curve points into one cluster', () => {
        const points = [
            point(morning, {id: 'payment-1', kind: 'payment'}),
            point(evening, {id: 'payment-2', kind: 'payment'}),
        ]
        const clusters = clusterPoints(points, 'month')
        expect(clusters).toHaveLength(1)
        expect(clusters[0].points.map(p => p.event!.id)).toEqual(['payment-1', 'payment-2'])
        expect(clusters[0].onOverlay).toBe(false)
    })

    it('keeps different days apart', () => {
        const points = [
            point(morning, {id: 'payment-1', kind: 'payment'}),
            point(otherDay, {id: 'payment-2', kind: 'payment'}),
        ]
        expect(clusterPoints(points, 'month')).toHaveLength(2)
    })

    it('keeps the actual curve and the overlay curve in separate clusters even on the same day', () => {
        const points = [
            point(morning, {id: 'payment-1', kind: 'payment'}),
            point(evening, {id: 'penalty-1', kind: 'penalty'}),
        ]
        const clusters = clusterPoints(points, 'month')
        expect(clusters).toHaveLength(2)
        expect(clusters.find(c => c.onOverlay)?.points[0].event!.id).toBe('penalty-1')
        expect(clusters.find(c => !c.onOverlay)?.points[0].event!.id).toBe('payment-1')
    })

    it('skips points without an event', () => {
        const points: DualPoint[] = [{ts: morning, actual: 0, virtual: 0, event: null}]
        expect(clusterPoints(points, 'month')).toEqual([])
    })

    it('clusters same-day points under all granularity (per-day bucketing)', () => {
        const points = [
            point(morning, {id: 'payment-1', kind: 'payment'}),
            point(evening, {id: 'payment-2', kind: 'payment'}),
        ]
        expect(clusterPoints(points, 'all')).toHaveLength(1)
    })

    it('keeps different days apart under all granularity', () => {
        const points = [
            point(morning, {id: 'payment-1', kind: 'payment'}),
            point(otherDay, {id: 'payment-2', kind: 'payment'}),
        ]
        expect(clusterPoints(points, 'all')).toHaveLength(2)
    })
})
