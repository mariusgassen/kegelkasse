import {describe, expect, it} from 'vitest'
import {
    headToHeadRows,
    isThrowRecord,
    mergeSeasons,
    seasonPenaltyPerEvening,
    visibleRecords,
    type H2HPlayer,
} from '@/lib/statsLab'
import type {ClubRecord, SeasonRow, SeasonSnapshot} from '@/types'

function player(over: Partial<H2HPlayer> = {}): H2HPlayer {
    return {
        name: 'Hans',
        nickname: null,
        regular_member_id: 1,
        evenings: 4,
        penalty_total: 12,
        game_wins: 2,
        beer_rounds: 5,
        shot_rounds: 1,
        avg_pins: 6,
        throw_count: 20,
        ...over,
    }
}

function record(over: Partial<ClubRecord> = {}): ClubRecord {
    return {
        key: 'most_kings',
        icon: '👑',
        unit: 'count',
        value: 3,
        holder_name: 'Hans',
        holder_member_id: 1,
        date: null,
        evening_id: null,
        ...over,
    }
}

function season(over: Partial<SeasonRow> = {}): SeasonRow {
    return {
        year: 2026,
        evening_count: 4,
        penalty_total: 40,
        drink_count: 12,
        player_count: 6,
        season_closed: false,
        ...over,
    }
}

describe('visibleRecords', () => {
    it('keeps every record when throw tracking is on', () => {
        const records = [record(), record({key: 'best_throw_evening', unit: 'pins'})]
        expect(visibleRecords(records, true)).toHaveLength(2)
    })

    it('drops throw-based records when the club has throw tracking off', () => {
        const records = [record(), record({key: 'best_throw_evening', unit: 'pins'})]
        const visible = visibleRecords(records, false)
        expect(visible.map(r => r.key)).toEqual(['most_kings'])
    })

    it('identifies throw records', () => {
        expect(isThrowRecord('best_throw_evening')).toBe(true)
        expect(isThrowRecord('most_kings')).toBe(false)
    })
})

describe('headToHeadRows', () => {
    it('marks the higher value as the winner of a row', () => {
        const rows = headToHeadRows(player({penalty_total: 12}), player({penalty_total: 8}))
        const penalties = rows.find(r => r.key === 'penaltyTotal')!
        expect(penalties.a).toBe(12)
        expect(penalties.b).toBe(8)
        expect(penalties.winner).toBe('a')
    })

    it('leaves a tie without a winner', () => {
        const rows = headToHeadRows(player({game_wins: 2}), player({game_wins: 2}))
        expect(rows.find(r => r.key === 'wins')!.winner).toBeNull()
    })

    it('derives per-evening rates', () => {
        const rows = headToHeadRows(
            player({penalty_total: 12, evenings: 4, game_wins: 2}),
            player({penalty_total: 9, evenings: 3, game_wins: 3}),
        )
        expect(rows.find(r => r.key === 'penaltyPerEvening')!.a).toBe(3)
        expect(rows.find(r => r.key === 'penaltyPerEvening')!.b).toBe(3)
        expect(rows.find(r => r.key === 'winRate')!.winner).toBe('b')
    })

    it('guards against divide-by-zero for a member with no evenings', () => {
        const rows = headToHeadRows(player({evenings: 0, penalty_total: 0, game_wins: 0}), player())
        expect(rows.find(r => r.key === 'penaltyPerEvening')!.a).toBeNull()
        expect(rows.find(r => r.key === 'winRate')!.a).toBeNull()
    })

    it('omits the throw row when the club does not track throws', () => {
        const rows = headToHeadRows(player(), player(), false)
        expect(rows.some(r => r.key === 'avgPins')).toBe(false)
    })

    it('drops a row both members have no value for', () => {
        const rows = headToHeadRows(player({avg_pins: null}), player({avg_pins: null}))
        expect(rows.some(r => r.key === 'avgPins')).toBe(false)
    })
})

describe('mergeSeasons', () => {
    const snapshot = (year: number, closedAt: string): SeasonSnapshot => ({
        id: year, year, closed_at: closedAt, closed_by_name: 'Admin',
        member_count: 7, evening_count: 9, carry_over_count: 0,
        total_penalties: 91, total_payments: 91, ranking_data: null, notes: null,
    })

    it('sorts newest season first and attaches the close date', () => {
        const merged = mergeSeasons(
            [season({year: 2025, season_closed: true}), season({year: 2026})],
            [snapshot(2025, '2026-01-02T10:00:00Z')],
        )
        expect(merged.map(s => s.year)).toEqual([2026, 2025])
        expect(merged[0].closed_at).toBeNull()
        expect(merged[1].closed_at).toBe('2026-01-02T10:00:00Z')
    })

    it('keeps open seasons that have no snapshot', () => {
        const merged = mergeSeasons([season({year: 2026})], [])
        expect(merged).toHaveLength(1)
        expect(merged[0].season_closed).toBe(false)
    })
})

describe('seasonPenaltyPerEvening', () => {
    it('averages the penalty total over the evenings', () => {
        expect(seasonPenaltyPerEvening(season({penalty_total: 40, evening_count: 4}))).toBe(10)
    })

    it('returns 0 for a season without evenings', () => {
        expect(seasonPenaltyPerEvening(season({evening_count: 0}))).toBe(0)
    })
})
