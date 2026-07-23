import {describe, expect, it} from 'vitest'
import {buildWrappedCards} from '../wrapped'
import type {WrappedStats} from '../../types'

const fe = (v: number) => `€${v.toFixed(2)}`

function stats(over: Partial<WrappedStats> = {}): WrappedStats {
    return {
        year: 2025,
        regular_member_id: 1,
        has_data: true,
        evenings_attended: 0,
        total_evenings: 0,
        attendance_pct: 0,
        penalty_total: 0,
        penalty_count: 0,
        biggest_penalty: null,
        top_penalty_type: null,
        king_count: 0,
        game_wins: 0,
        total_beers: 0,
        total_shots: 0,
        avg_pins: null,
        best_avg_pins: null,
        penalty_rank: null,
        ranked_members: 0,
        title_key: 'allrounder',
        title_icon: '🎳',
        ...over,
    }
}

function ids(s: WrappedStats): string[] {
    return buildWrappedCards(s, fe).map(c => c.id)
}

describe('buildWrappedCards', () => {
    it('always starts with intro and ends with finale', () => {
        const cards = buildWrappedCards(stats(), fe)
        expect(cards[0].id).toBe('intro')
        expect(cards[cards.length - 1].id).toBe('finale')
    })

    it('empty year shows only intro + finale', () => {
        expect(ids(stats())).toEqual(['intro', 'finale'])
    })

    it('skips attendance card when nothing attended', () => {
        expect(ids(stats())).not.toContain('attendance')
    })

    it('includes attendance card with fraction value', () => {
        const cards = buildWrappedCards(stats({evenings_attended: 8, total_evenings: 10, attendance_pct: 80}), fe)
        const att = cards.find(c => c.id === 'attendance')!
        expect(att.value).toBe('8 / 10')
        expect(att.subtextValue).toBe('80%')
    })

    it('includes penalties card with formatted euro', () => {
        const cards = buildWrappedCards(stats({penalty_count: 4, penalty_total: 12.5}), fe)
        const p = cards.find(c => c.id === 'penalties')!
        expect(p.value).toBe('€12.50')
        expect(p.subtextValue).toBe('4')
    })

    it('includes biggest penalty card with icon + name subtext', () => {
        const cards = buildWrappedCards(stats({
            biggest_penalty: {amount: 9, name: 'Pumpe', icon: '💥', date: '2025-06-01'},
        }), fe)
        const b = cards.find(c => c.id === 'biggest')!
        expect(b.value).toBe('€9.00')
        expect(b.subtextValue).toBe('💥 Pumpe')
    })

    it('includes favorite penalty card using its icon as emoji', () => {
        const cards = buildWrappedCards(stats({
            top_penalty_type: {name: 'Null', icon: '🥚', count: 7},
        }), fe)
        const f = cards.find(c => c.id === 'favorite')!
        expect(f.emoji).toBe('🥚')
        expect(f.value).toBe('7×')
        expect(f.subtextValue).toBe('Null')
    })

    it('includes king / wins / drinks cards only when > 0', () => {
        expect(ids(stats({king_count: 2}))).toContain('king')
        expect(ids(stats({game_wins: 3}))).toContain('wins')
        expect(ids(stats({total_beers: 1}))).toContain('drinks')
        expect(ids(stats({total_shots: 1}))).toContain('drinks')
        expect(ids(stats())).not.toContain('drinks')
    })

    it('includes throws card only when avg_pins present', () => {
        expect(ids(stats({avg_pins: 6.4, best_avg_pins: 8.1}))).toContain('throws')
        expect(ids(stats({avg_pins: null}))).not.toContain('throws')
    })

    it('omits the throws card when throw tracking is disabled', () => {
        const withThrows = stats({avg_pins: 6.4, best_avg_pins: 8.1})
        expect(buildWrappedCards(withThrows, fe, false).map(c => c.id)).not.toContain('throws')
        // Other cards are unaffected.
        expect(buildWrappedCards(withThrows, fe, false).map(c => c.id)).toContain('intro')
    })

    it('includes rank card with #-prefixed value', () => {
        const cards = buildWrappedCards(stats({penalty_rank: 2, ranked_members: 9}), fe)
        const r = cards.find(c => c.id === 'rank')!
        expect(r.value).toBe('#2')
        expect(r.subtextValue).toBe('9')
    })

    it('finale headline key maps to the title', () => {
        const cards = buildWrappedCards(stats({title_key: 'sinner', title_icon: '😈'}), fe)
        const finale = cards[cards.length - 1]
        expect(finale.emoji).toBe('😈')
        expect(finale.subtextKey).toBe('wrapped.title.sinner')
    })

    it('preserves card order (intro, attendance, penalties, ...)', () => {
        const s = stats({
            evenings_attended: 5, total_evenings: 6,
            penalty_count: 2, penalty_total: 3,
            king_count: 1, game_wins: 1,
        })
        expect(ids(s)).toEqual(['intro', 'attendance', 'penalties', 'king', 'wins', 'finale'])
    })
})
