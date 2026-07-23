import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import type {Evening} from '@/types.ts'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

import {LiveEveningView} from '../evening/LiveEveningView'

function evening(overrides: Partial<Evening> = {}): Evening {
    return {
        id: 1, date: '2026-07-23', venue: null, note: null, is_closed: false, ended_at: null,
        season_closed: false, players: [], teams: [], penalty_log: [], games: [], drink_rounds: [],
        highlights: [], ...overrides,
    }
}

function runningGame(active_player_id: number | null = 1, throws: any[] = []) {
    return {
        id: 1, name: 'Eröffnung', template_id: null, is_opener: true, winner_type: 'individual' as const,
        turn_mode: 'alternating' as const, winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0,
        per_point_penalty: 0, note: null, sort_order: 0, status: 'running' as const, started_at: null,
        finished_at: null, client_timestamp: 0, active_player_id, throws,
    }
}

let onQuickEntry: ReturnType<typeof vi.fn<() => void>>
let onGoHighlights: ReturnType<typeof vi.fn<() => void>>
let onGoGames: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
    onQuickEntry = vi.fn<() => void>()
    onGoHighlights = vi.fn<() => void>()
    onGoGames = vi.fn<() => void>()
})

function renderView(ev: Evening, quick: (() => void) | undefined = onQuickEntry) {
    return render(
        <LiveEveningView evening={ev} onQuickEntry={quick}
                         onGoHighlights={onGoHighlights} onGoGames={onGoGames}/>,
    )
}

describe('LiveEveningView', () => {
    it('shows the running game and active player', () => {
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: 'Der Rudi', regular_member_id: null, team_id: null, is_king: false}],
            games: [runningGame(1)],
        })
        renderView(ev)
        expect(screen.getByText('live.running')).toBeInTheDocument()
        expect(screen.getByText('Der Rudi')).toBeInTheDocument()
    })

    it('shows the last throw pins', () => {
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            games: [runningGame(1, [{id: 1, throw_num: 1, pins: 9, cumulative: 9, pin_states: [], player_id: 1}])],
        })
        renderView(ev)
        expect(screen.getByText('9')).toBeInTheDocument()
        expect(screen.getByText('live.lastThrow')).toBeInTheDocument()
    })

    it('shows the no-game state and navigates to games on tap', () => {
        renderView(evening())
        const btn = screen.getByText('live.noGame')
        expect(btn).toBeInTheDocument()
        fireEvent.click(btn)
        expect(onGoGames).toHaveBeenCalled()
    })

    it('renders the stat row with the penalty total', () => {
        const ev = evening({
            penalty_log: [{
                id: 1, player_id: 1, team_id: null, player_name: 'Rudi', penalty_type_name: 'Pudel',
                icon: '🎳', amount: 2, mode: 'euro', unit_amount: null, regular_member_id: null,
                game_id: null, client_timestamp: 1000,
            }],
        })
        renderView(ev)
        expect(screen.getByText('live.stat.penalties')).toBeInTheDocument()
    })

    it('wires the quick actions to their callbacks', () => {
        renderView(evening())
        fireEvent.click(screen.getByText('live.action.penalty'))
        expect(onQuickEntry).toHaveBeenCalled()
        fireEvent.click(screen.getByText('live.action.highlight'))
        expect(onGoHighlights).toHaveBeenCalled()
    })

    it('disables the penalty/round quick actions when quick entry is unavailable', () => {
        render(
            <LiveEveningView evening={evening()} onQuickEntry={undefined}
                             onGoHighlights={onGoHighlights} onGoGames={onGoGames}/>,
        )
        const btn = screen.getByText('live.action.penalty').closest('button')!
        expect(btn).toBeDisabled()
    })

    it('renders the event ticker newest-first', () => {
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            penalty_log: [{
                id: 1, player_id: 1, team_id: null, player_name: 'Rudi', penalty_type_name: 'Pudel',
                icon: '🎳', amount: 1, mode: 'euro', unit_amount: null, regular_member_id: null,
                game_id: null, client_timestamp: 1000,
            }],
            drink_rounds: [{id: 1, drink_type: 'beer', variety: null, participant_ids: [1], client_timestamp: 5000}],
        })
        renderView(ev)
        const cards = screen.getAllByText(/Bier|Pudel/)
        // Drink (newer) appears before penalty (older) in DOM order.
        expect(cards[0].textContent).toContain('Bier')
    })

    it('shows the empty ticker state when nothing has happened', () => {
        renderView(evening())
        expect(screen.getByText('live.tickerEmpty')).toBeInTheDocument()
    })
})
