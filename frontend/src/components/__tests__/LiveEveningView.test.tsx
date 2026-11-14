import {describe, it, expect, vi, beforeEach} from 'vitest'
import {act, render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import type {Evening} from '@/types.ts'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
// The view reads throw-tracking from the club query; default it on so the throw UI is exercised.
const throwTrackingMock = vi.fn(() => true)
vi.mock('@/hooks/useClub.ts', () => ({useThrowTracking: () => throwTrackingMock()}))
vi.mock('@/api/client.ts', () => ({
    api: {
        applyClubTeamsToEvening: vi.fn(() => Promise.resolve({})),
        shuffleTeamPlayers: vi.fn(() => Promise.resolve({})),
        updatePlayer: vi.fn(() => Promise.resolve({})),
    },
}))

import {LiveEveningView} from '../evening/LiveEveningView'
import {api} from '@/api/client.ts'

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
    throwTrackingMock.mockReturnValue(true)
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
        // 9 shows twice: as the last throw and as Rudi's standing.
        expect(screen.getAllByText('9')).toHaveLength(2)
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
        // With a mocked identity t(), the drink round's fallback label is the raw key.
        const cards = screen.getAllByText(/^(drinks\.beer|Pudel)$/)
        // Drink (newer) appears before penalty (older) in DOM order.
        expect(cards[0].textContent).toContain('drinks.beer')
    })

    it('shows the empty ticker state when nothing has happened', () => {
        renderView(evening())
        expect(screen.getByText('live.tickerEmpty')).toBeInTheDocument()
    })

    it('puts an "Alle Neune" throw into the ticker', () => {
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            games: [runningGame(1, [
                {id: 1, throw_num: 1, pins: 9, cumulative: 9, pin_states: [], player_id: 1, created_at: '2026-07-23T20:00:00Z'},
                {id: 2, throw_num: 2, pins: 4, cumulative: 13, pin_states: [], player_id: 1, created_at: '2026-07-23T20:01:00Z'},
            ])],
        })
        renderView(ev)
        // The nine gets its own ticker row; the ordinary throw stays out of the feed.
        expect(screen.getByText('live.allNine')).toBeInTheDocument()
        expect(screen.queryByText('live.tickerEmpty')).not.toBeInTheDocument()
    })

    it('keeps throws out of the ticker when throw tracking is disabled', () => {
        throwTrackingMock.mockReturnValue(false)
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            games: [runningGame(1, [
                {id: 1, throw_num: 1, pins: 9, cumulative: 9, pin_states: [], player_id: 1, created_at: '2026-07-23T20:00:00Z'},
            ])],
        })
        renderView(ev)
        expect(screen.queryByText('live.allNine')).not.toBeInTheDocument()
        expect(screen.getByText('live.tickerEmpty')).toBeInTheDocument()
    })

    it('hides the last throw when throw tracking is disabled', () => {
        throwTrackingMock.mockReturnValue(false)
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            games: [runningGame(1, [{id: 1, throw_num: 1, pins: 9, cumulative: 9, pin_states: [], player_id: 1}])],
        })
        renderView(ev)
        // Scoreboard still renders, but the throw readout is gone.
        expect(screen.getByText('live.running')).toBeInTheDocument()
        expect(screen.queryByText('live.lastThrow')).not.toBeInTheDocument()
    })

    it('hides the active/next player (active_player_id is camera-only) when throw tracking is disabled', () => {
        throwTrackingMock.mockReturnValue(false)
        const ev = evening({
            players: [
                {id: 1, name: 'Rudi', nickname: 'Der Rudi', regular_member_id: null, team_id: null, is_king: false},
                {id: 2, name: 'Toni', nickname: null, regular_member_id: null, team_id: null, is_king: false},
            ],
            games: [runningGame(1)],
        })
        renderView(ev)
        expect(screen.getByText('live.running')).toBeInTheDocument()
        expect(screen.queryByText('live.onTurn')).not.toBeInTheDocument()
        expect(screen.queryByText('Der Rudi')).not.toBeInTheDocument()
        expect(screen.queryByText(/live\.next/)).not.toBeInTheDocument()
    })

    it('renders the prominent Quick Entry hero CTA and wires it to onQuickEntry', () => {
        renderView(evening())
        const cta = screen.getByTestId('live-quick-entry-cta')
        expect(cta).toHaveTextContent('quickEntry.open')
        expect(cta).not.toBeDisabled()
        fireEvent.click(cta)
        expect(onQuickEntry).toHaveBeenCalledTimes(1)
    })

    it('disables the Quick Entry hero CTA when onQuickEntry is undefined', () => {
        render(
            <LiveEveningView evening={evening()} onQuickEntry={undefined}
                             onGoHighlights={onGoHighlights} onGoGames={onGoGames}/>,
        )
        expect(screen.getByTestId('live-quick-entry-cta')).toBeDisabled()
    })

    it('renders game start/finish dividers and band borders across the full uncapped history', () => {
        const penalties = Array.from({length: 35}, (_, i) => ({
            id: i + 1,
            player_id: 1,
            team_id: null,
            player_name: `Spieler-${i + 1}`,
            penalty_type_name: 'Pudel',
            icon: '🎳',
            amount: 1,
            mode: 'euro' as const,
            unit_amount: null,
            regular_member_id: null,
            game_id: 1,
            client_timestamp: 2000 + i,
        }))
        const ev = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            games: [{
                ...runningGame(1),
                status: 'finished' as const,
                winner_name: 'Rudi',
                started_at: '1970-01-01T00:00:01Z',
                finished_at: '1970-01-01T00:00:10Z',
            }],
            penalty_log: penalties,
        })
        renderView(ev)
        expect(screen.getByTestId('live-game-start-1')).toBeInTheDocument()
        expect(screen.getByTestId('live-game-finish-1')).toHaveTextContent('Rudi')
        // Uncapped feed renders all 35 penalty rows
        expect(screen.getByText('Spieler-1')).toBeInTheDocument()
        expect(screen.getByText('Spieler-35')).toBeInTheDocument()
        expect(document.querySelectorAll('[data-band="0"]').length).toBe(35)
    })
})

describe('LiveEveningView — visuals', () => {
    const pen = (id: number, player_id: number, amount: number, ts: number, penalty_type_name = 'Pudel') => ({
        id, player_id, team_id: null, player_name: 'x', penalty_type_name, icon: '🎳', amount,
        mode: 'euro' as const, unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: ts,
    })
    const players = [
        {id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false},
        {id: 2, name: 'Toni', nickname: null, regular_member_id: null, team_id: null, is_king: false},
    ]

    it('ranks players by tonight\'s fines on a shared bar scale', () => {
        renderView(evening({players, penalty_log: [pen(1, 1, 1, 1000), pen(2, 2, 3, 2000)]}))
        const rows = screen.getAllByTestId(/^live-rank-\d+$/)
        expect(rows.map(r => r.dataset.testid)).toEqual(['live-rank-2', 'live-rank-1'])
        expect(screen.getByTestId('live-rank-bar-2')).toBeInTheDocument()
    })

    it('hides the ranking and penalty counts when nobody has a fine', () => {
        renderView(evening({players}))
        expect(screen.queryByTestId('live-ranking')).not.toBeInTheDocument()
        expect(screen.queryByTestId('live-penalty-counts')).not.toBeInTheDocument()
    })

    it('renders penalty type ×N counts sorted by frequency descending', () => {
        renderView(evening({
            players,
            penalty_log: [
                pen(1, 1, 1, 1000, 'Pudel'),
                pen(2, 2, 1, 2000, 'Kranz'),
                pen(3, 1, 1, 3000, 'Pudel'),
            ],
        }))
        const container = screen.getByTestId('live-penalty-counts')
        expect(container).toBeInTheDocument()
        const chips = screen.getAllByTestId(/^live-penalty-count-/)
        expect(chips.map(c => c.dataset.testid)).toEqual([
            'live-penalty-count-Pudel',
            'live-penalty-count-Kranz',
        ])
        expect(chips[0]).toHaveTextContent('×2')
        expect(chips[1]).toHaveTextContent('×1')
    })

    it('draws the penalty curve once there are a few bookings', () => {
        renderView(evening({players, penalty_log: [pen(1, 1, 1, 1000), pen(2, 2, 3, 2000), pen(3, 1, 1, 3000)]}))
        expect(screen.getByTestId('live-curve')).toBeInTheDocument()
    })

    it('shows the running game standings, hidden without throw tracking', () => {
        const ev = evening({players, games: [runningGame(1, [
            {id: 1, throw_num: 1, pins: 5, cumulative: 5, pin_states: [], player_id: 1},
            {id: 2, throw_num: 1, pins: 7, cumulative: 7, pin_states: [], player_id: 2},
        ])]})
        const {unmount} = renderView(ev)
        expect(screen.getByTestId('live-standings')).toBeInTheDocument()
        expect(screen.getByTestId('live-standing-p:2')).toBeInTheDocument()
        unmount()
        throwTrackingMock.mockReturnValue(false)
        renderView(ev)
        expect(screen.queryByTestId('live-standings')).not.toBeInTheDocument()
    })

    it('renders the no-game warning card and inline team setup at the start of an evening', async () => {
        const onGoManage = vi.fn()
        const onUpdated = vi.fn()
        const ev = evening({
            players: [
                {id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false},
                {id: 2, name: 'Toni', nickname: null, regular_member_id: null, team_id: 10, is_king: false},
            ],
            teams: [{id: 10, name: 'Team A'}, {id: 11, name: 'Team B'}],
        })
        render(
            <LiveEveningView
                evening={ev}
                onQuickEntry={onQuickEntry}
                onGoHighlights={onGoHighlights}
                onGoGames={onGoGames}
                onGoManage={onGoManage}
                onUpdated={onUpdated}
            />,
        )
        expect(screen.getByTestId('live-no-game-alert')).toBeInTheDocument()
        expect(screen.getByTestId('live-team-setup')).toBeInTheDocument()
        expect(screen.getByText('team.unassignedBadge')).toBeInTheDocument()

        const teamBButtons = screen.getAllByRole('button', {name: 'Team B'})
        await act(async () => {
            fireEvent.click(teamBButtons[0])
        })
        expect(api.updatePlayer).toHaveBeenCalledWith(1, 1, {team_id: 11})

        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: /team\.shuffle/}))
        })
        expect(api.shuffleTeamPlayers).toHaveBeenCalledWith(1)
    })

    it('shows template/random team actions when no teams exist yet and hides team setup once a game runs with assigned teams', async () => {
        const noTeams = evening({
            players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: null, is_king: false}],
            teams: [],
        })
        const {rerender} = render(
            <LiveEveningView
                evening={noTeams}
                onQuickEntry={onQuickEntry}
                onGoHighlights={onGoHighlights}
                onGoGames={onGoGames}
            />,
        )
        await act(async () => {
            fireEvent.click(screen.getByRole('button', {name: /team\.randomizeShort/}))
        })
        expect(api.applyClubTeamsToEvening).toHaveBeenCalledWith(1, true)

        rerender(
            <LiveEveningView
                evening={evening({
                    players: [{id: 1, name: 'Rudi', nickname: null, regular_member_id: null, team_id: 10, is_king: false}],
                    teams: [{id: 10, name: 'Team A'}],
                    games: [runningGame(1)],
                })}
                onQuickEntry={onQuickEntry}
                onGoHighlights={onGoHighlights}
                onGoGames={onGoGames}
            />,
        )
        expect(screen.queryByTestId('live-team-setup')).not.toBeInTheDocument()
    })
})
