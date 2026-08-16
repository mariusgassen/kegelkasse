import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import React from 'react'
import type {PenaltyTimelineEvent} from '@/lib/protocolTimeline.ts'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

import {PenaltyTimeline} from '../evening/PenaltyTimeline'

function penaltyEvent(overrides: Partial<PenaltyTimelineEvent & {kind: 'penalty'}> = {}): PenaltyTimelineEvent {
    return {
        kind: 'penalty',
        gameName: null,
        ts: 1000,
        entry: {
            id: 1, player_id: 1, team_id: null, player_name: 'Rudi', penalty_type_name: 'Pudel', icon: '🎳',
            amount: 1.5, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null,
            client_timestamp: 1000,
        },
        ...overrides,
    } as PenaltyTimelineEvent
}

describe('PenaltyTimeline', () => {
    it('shows an empty state when there are no events', () => {
        render(<PenaltyTimeline events={[]}/>)
        expect(screen.getByText('penalty.none')).toBeInTheDocument()
    })

    it('renders a penalty entry with player, type and amount', () => {
        render(<PenaltyTimeline events={[penaltyEvent()]}/>)
        expect(screen.getByText('Rudi')).toBeInTheDocument()
        expect(screen.getByText('Pudel')).toBeInTheDocument()
        expect(screen.getByText(/1,50/)).toBeInTheDocument()
    })

    it('appends the game name to the subtitle when present', () => {
        render(<PenaltyTimeline events={[penaltyEvent({gameName: 'Bundeskegeln'})]}/>)
        expect(screen.getByText(/Bundeskegeln/)).toBeInTheDocument()
    })

    it('renders a game-started divider', () => {
        render(<PenaltyTimeline events={[{
            kind: 'game_started', ts: 1000,
            game: {
                id: 1, name: 'Eröffnungsspiel', template_id: null, is_opener: true, winner_type: 'individual',
                turn_mode: 'alternating', winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0,
                per_point_penalty: 0, note: null, sort_order: 0, status: 'finished', started_at: null,
                finished_at: null, client_timestamp: 0, active_player_id: null, throws: [],
            },
        }]}/>)
        expect(screen.getByText(/▶ Eröffnungsspiel/)).toBeInTheDocument()
    })

    it('renders a game-finished divider with the winner', () => {
        render(<PenaltyTimeline events={[{
            kind: 'game_finished', ts: 1000,
            game: {
                id: 1, name: 'Eröffnungsspiel', template_id: null, is_opener: true, winner_type: 'individual',
                turn_mode: 'alternating', winner_ref: null, winner_name: 'Hans', scores: {}, loser_penalty: 0,
                per_point_penalty: 0, note: null, sort_order: 0, status: 'finished', started_at: null,
                finished_at: null, client_timestamp: 0, active_player_id: null, throws: [],
            },
        }]}/>)
        expect(screen.getByText(/🏁 Eröffnungsspiel · Hans/)).toBeInTheDocument()
    })
})
