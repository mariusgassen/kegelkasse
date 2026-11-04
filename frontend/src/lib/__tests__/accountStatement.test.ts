import {describe, expect, it} from 'vitest'
import {buildAccountStatement} from '../accountStatement'

const pay = (id: number, amount: number, created_at: string, date: string | null = null) =>
    ({id, amount, note: null, created_at, updated_at: null, date})
const pen = (evening_id: number, amount: number, evening_date: string | null, is_absence = false) =>
    ({amount, evening_id, evening_date, is_absence, created_at: evening_date})

describe('buildAccountStatement', () => {
    it('returns an empty list without data', () => {
        expect(buildAccountStatement([], [])).toEqual([])
    })

    it('sums penalties per evening instead of listing them individually', () => {
        const out = buildAccountStatement([], [
            pen(1, 1, '2026-01-05T20:00:00'), pen(1, 2.5, '2026-01-05T20:00:00'), pen(2, 0.3, '2026-01-12T20:00:00'),
        ])
        expect(out).toHaveLength(2)
        const first = out.find(e => e.kind === 'evening' && e.eveningId === 1)
        expect(first).toMatchObject({kind: 'evening', total: 3.5, count: 2, absenceOnly: false})
    })

    it('merges payments and evenings newest first', () => {
        const out = buildAccountStatement(
            [pay(10, 5, '2026-01-20T10:00:00'), pay(11, 3, '2026-02-01T10:00:00', '2026-01-08')],
            [pen(1, 2, '2026-01-05T20:00:00'), pen(2, 4, '2026-01-15T20:00:00')],
        )
        expect(out.map(e => e.key)).toEqual(['p-10', 'e-2', 'p-11', 'e-1'])
    })

    it('flags an evening made only of absence penalties', () => {
        const out = buildAccountStatement([], [pen(1, 2, '2026-01-05T20:00:00', true)])
        expect(out[0]).toMatchObject({kind: 'evening', absenceOnly: true})
        const mixed = buildAccountStatement([], [pen(1, 2, null, true), pen(1, 1, '2026-01-05T20:00:00')])
        expect(mixed[0]).toMatchObject({absenceOnly: false, date: '2026-01-05T20:00:00'})
    })

    it('drops evenings that contributed nothing (e.g. guest cap reached) and rounds sums', () => {
        const out = buildAccountStatement([], [pen(1, 0, '2026-01-05T20:00:00'), pen(2, 0.1, '2026-01-06T20:00:00'), pen(2, 0.2, '2026-01-06T20:00:00')])
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({total: 0.3})
    })
})
