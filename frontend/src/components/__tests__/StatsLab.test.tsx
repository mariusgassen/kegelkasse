import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {ClubRecordsResponse} from '@/types'

// useT returns the key verbatim so we can assert on i18n keys directly.
vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
}))

vi.mock('@/api/client', () => ({
    api: {
        getClubRecords: vi.fn(),
        listSeasonSnapshots: vi.fn(),
    },
}))

const throwTracking = vi.fn(() => true)
vi.mock('@/hooks/useClub.ts', () => ({useThrowTracking: () => throwTracking()}))

import {api} from '@/api/client'
import {ClubRecords} from '@/components/stats/ClubRecords'
import {HeadToHead} from '@/components/stats/HeadToHead'
import {SeasonComparison} from '@/components/stats/SeasonComparison'
import type {H2HPlayer} from '@/lib/statsLab'

const RECORDS: ClubRecordsResponse = {
    records: [
        {
            key: 'most_expensive_evening', icon: '💸', unit: 'eur', value: 42.5,
            holder_name: null, holder_member_id: null, date: '2026-03-15', evening_id: 10,
        },
        {
            key: 'most_kings', icon: '👑', unit: 'count', value: 3,
            holder_name: 'Franzi', holder_member_id: 2, date: null, evening_id: null,
        },
        {
            key: 'best_throw_evening', icon: '🎳', unit: 'pins', value: 7.4,
            holder_name: 'Hans', holder_member_id: 1, date: '2026-01-20', evening_id: 11,
        },
    ],
    seasons: [
        {year: 2025, evening_count: 9, penalty_total: 91, drink_count: 30, player_count: 7, season_closed: true},
        {year: 2026, evening_count: 4, penalty_total: 55.5, drink_count: 15, player_count: 6, season_closed: false},
    ],
}

function wrapper() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return function Wrapper({children}: {children: React.ReactNode}) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

function player(over: Partial<H2HPlayer> = {}): H2HPlayer {
    return {
        name: 'Hans', nickname: null, regular_member_id: 1, evenings: 4, penalty_total: 12,
        game_wins: 2, beer_rounds: 5, shot_rounds: 1, avg_pins: 6, throw_count: 20, ...over,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    throwTracking.mockReturnValue(true)
    vi.mocked(api.getClubRecords).mockResolvedValue(RECORDS)
    vi.mocked(api.listSeasonSnapshots).mockResolvedValue([
        {
            id: 1, year: 2025, closed_at: '2026-01-02T10:00:00Z', closed_by_name: 'Admin',
            member_count: 7, evening_count: 9, carry_over_count: 0, total_penalties: 91,
            total_payments: 91, ranking_data: null, notes: null,
        },
    ])
})

describe('ClubRecords', () => {
    it('renders one row per record with its label and holder', async () => {
        render(<ClubRecords/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByTestId('record-most_kings')).toBeTruthy())
        expect(screen.getByText('stats.records.most_kings')).toBeTruthy()
        expect(screen.getByText('Franzi')).toBeTruthy()
        expect(screen.getByTestId('record-most_expensive_evening')).toBeTruthy()
    })

    it('hides throw-based records when the club does not track throws', async () => {
        throwTracking.mockReturnValue(false)
        render(<ClubRecords/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByTestId('record-most_kings')).toBeTruthy())
        expect(screen.queryByTestId('record-best_throw_evening')).toBeNull()
    })

    it('marks the current user with an Ich badge', async () => {
        render(<ClubRecords myMemberId={2}/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByTestId('record-most_kings')).toBeTruthy())
        expect(screen.getByText('common.me')).toBeTruthy()
    })

    it('opens the member detail when a record with a holder is tapped', async () => {
        const onSelect = vi.fn()
        render(<ClubRecords onSelectMember={onSelect}/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByTestId('record-most_kings')).toBeTruthy())
        fireEvent.click(screen.getByTestId('record-most_kings'))
        expect(onSelect).toHaveBeenCalledWith(2)
        // The evening-scoped record has no holder → it is not a button.
        fireEvent.click(screen.getByTestId('record-most_expensive_evening'))
        expect(onSelect).toHaveBeenCalledTimes(1)
    })

    it('shows an empty state when the club has no records yet', async () => {
        vi.mocked(api.getClubRecords).mockResolvedValue({records: [], seasons: []})
        render(<ClubRecords/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByText('stats.records.empty')).toBeTruthy())
    })
})

describe('HeadToHead', () => {
    const PLAYERS = [
        player({regular_member_id: 1, name: 'Hans'}),
        player({regular_member_id: 2, name: 'Franzi', nickname: 'Fra', penalty_total: 8}),
        player({regular_member_id: 3, name: 'Klaus'}),
    ]

    it('asks for a second member before comparing', () => {
        render(<HeadToHead players={PLAYERS}/>, {wrapper: wrapper()})
        expect(screen.getByText('stats.h2h.pickSecond')).toBeTruthy()
        expect(screen.queryByTestId('h2h-table')).toBeNull()
    })

    it('compares the anchor against the tapped member', () => {
        render(<HeadToHead players={PLAYERS} myMemberId={1}/>, {wrapper: wrapper()})
        fireEvent.click(screen.getByTestId('h2h-pill-2'))
        expect(screen.getByTestId('h2h-table')).toBeTruthy()
        expect(screen.getByText('stats.h2h.penaltyTotal')).toBeTruthy()
        // Kegelname wins over the full name.
        expect(screen.getAllByText('Fra').length).toBeGreaterThanOrEqual(1)
    })

    it('clears the opponent when its pill is tapped again', () => {
        render(<HeadToHead players={PLAYERS} myMemberId={1}/>, {wrapper: wrapper()})
        fireEvent.click(screen.getByTestId('h2h-pill-2'))
        fireEvent.click(screen.getByTestId('h2h-pill-2'))
        expect(screen.queryByTestId('h2h-table')).toBeNull()
    })

    it('drops the throw row when the club does not track throws', () => {
        throwTracking.mockReturnValue(false)
        render(<HeadToHead players={PLAYERS} myMemberId={1}/>, {wrapper: wrapper()})
        fireEvent.click(screen.getByTestId('h2h-pill-2'))
        expect(screen.queryByText('stats.h2h.avgPins')).toBeNull()
    })

    it('explains when there are not enough members', () => {
        render(<HeadToHead players={[player()]}/>, {wrapper: wrapper()})
        expect(screen.getByText('stats.h2h.notEnough')).toBeTruthy()
    })
})

describe('SeasonComparison', () => {
    it('lists seasons newest first and marks closed ones', async () => {
        render(<SeasonComparison/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByTestId('season-row-2026')).toBeTruthy())
        const rows = screen.getAllByTestId(/^season-row-/)
        expect(rows[0].getAttribute('data-testid')).toBe('season-row-2026')
        expect(screen.getByText(/stats\.seasons\.closed/)).toBeTruthy()
    })

    it('reports the tapped year', async () => {
        const onSelectYear = vi.fn()
        render(<SeasonComparison selectedYear={2026} onSelectYear={onSelectYear}/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByTestId('season-row-2025')).toBeTruthy())
        fireEvent.click(screen.getByTestId('season-row-2025'))
        expect(onSelectYear).toHaveBeenCalledWith(2025)
    })

    it('shows an empty state without seasons', async () => {
        vi.mocked(api.getClubRecords).mockResolvedValue({records: [], seasons: []})
        render(<SeasonComparison/>, {wrapper: wrapper()})
        await waitFor(() => expect(screen.getByText('stats.seasons.empty')).toBeTruthy())
    })
})
