import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import type {WrappedStats} from '@/types.ts'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
// The deck gates its throws card on the club's throw-tracking flag; default it on.
const throwTrackingMock = vi.fn(() => true)
vi.mock('@/hooks/useClub.ts', () => ({useThrowTracking: () => throwTrackingMock()}))

import {WrappedDeck} from '../WrappedDeck'

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

let onClose: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
    onClose = vi.fn<() => void>()
    throwTrackingMock.mockReturnValue(true)
})

/** Body renders only the *current* card's headline as visible text. */
function currentHeadline(): string | null {
    for (const key of ['wrapped.card.intro', 'wrapped.card.penalties', 'wrapped.card.king', 'wrapped.card.finale']) {
        // The dialog title / progress aria-labels are not text nodes, so getAllByText only
        // returns body text; the current card is the one present.
        if (screen.queryAllByText(key).length > 0) return key
    }
    return null
}

describe('WrappedDeck', () => {
    it('renders nothing when closed', () => {
        const {container} = render(<WrappedDeck open={false} onClose={onClose} stats={stats()}/>)
        expect(container.firstChild).toBeNull()
    })

    it('tapping a progress segment navigates back and forth', () => {
        // cards: intro, penalties, king, finale
        render(<WrappedDeck open onClose={onClose} stats={stats({penalty_count: 1, king_count: 1})}/>)
        expect(currentHeadline()).toBe('wrapped.card.intro')

        fireEvent.click(screen.getByRole('button', {name: 'wrapped.card.king'}))
        expect(currentHeadline()).toBe('wrapped.card.king')

        // Jump back to an earlier segment — this is the breadcrumb back-navigation.
        fireEvent.click(screen.getByRole('button', {name: 'wrapped.card.penalties'}))
        expect(currentHeadline()).toBe('wrapped.card.penalties')
    })

    it('tapping the last (finale) slide closes the deck', () => {
        render(<WrappedDeck open onClose={onClose} stats={stats({penalty_count: 1})}/>)
        // Jump straight to the finale via its progress segment.
        fireEvent.click(screen.getByRole('button', {name: 'wrapped.card.finale'}))
        expect(currentHeadline()).toBe('wrapped.card.finale')

        // A tap on the card body (advance region in jsdom) past the last card closes it.
        fireEvent.click(screen.getByText('wrapped.card.finale'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('omits the throws card when throw tracking is disabled', () => {
        throwTrackingMock.mockReturnValue(false)
        render(<WrappedDeck open onClose={onClose} stats={stats({avg_pins: 6.4, best_avg_pins: 8.1})}/>)
        // Progress segments enumerate every card; no throws segment means no throws card.
        expect(screen.queryByRole('button', {name: 'wrapped.card.throws'})).toBeNull()
    })

    it('includes the throws card when throw tracking is enabled', () => {
        throwTrackingMock.mockReturnValue(true)
        render(<WrappedDeck open onClose={onClose} stats={stats({avg_pins: 6.4, best_avg_pins: 8.1})}/>)
        expect(screen.getByRole('button', {name: 'wrapped.card.throws'})).toBeTruthy()
    })
})
