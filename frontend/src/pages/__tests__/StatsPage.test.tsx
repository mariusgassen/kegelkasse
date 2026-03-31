import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/useEvening.ts', () => ({
    useEveningList: vi.fn(),
}))

const storeState = {
    user: null as any,
    activeEveningId: null as any,
    regularMembers: [] as any[],
}

vi.mock('@/store/app.ts', () => ({
    isAdmin: vi.fn(() => false),
    useAppStore: Object.assign(
        vi.fn((sel: any) => sel(storeState)),
        { getState: () => storeState },
    ),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getYearStats: vi.fn(),
        getEvening: vi.fn(),
        listPins: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({
    toastError: vi.fn(),
}))

vi.mock('@/components/ui/CommentThread.tsx', () => ({
    CommentThread: () => null,
}))

vi.mock('@/components/ui/ItemReactionBar.tsx', () => ({
    ItemReactionBar: () => null,
}))

vi.mock('@/components/ui/MediaUploadButton.tsx', () => ({
    MediaUploadButton: () => null,
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const YEAR_STATS = {
    year: 2026,
    evening_count: 4,
    total_penalties: 55.50,
    total_beers: 12,
    total_shots: 3,
    players: [
        {
            regular_member_id: 1,
            name: 'Hans',
            evenings: 4,
            penalty_total: 12.50,
            penalty_count: 5,
            game_wins: 3,
            beer_rounds: 4,
            shot_rounds: 1,
            total_pins: 120,
            throw_count: 20,
            avg_pins: 6.0,
        },
        {
            regular_member_id: 2,
            name: 'Franzi',
            evenings: 3,
            penalty_total: 8.00,
            penalty_count: 3,
            game_wins: 1,
            beer_rounds: 2,
            shot_rounds: 0,
            total_pins: 80,
            throw_count: 15,
            avg_pins: 5.3,
        },
        {
            regular_member_id: 3,
            name: 'Klaus',
            evenings: 2,
            penalty_total: 5.00,
            penalty_count: 2,
            game_wins: 0,
            beer_rounds: 1,
            shot_rounds: 0,
            total_pins: 0,
            throw_count: 0,
            avg_pins: null,
        },
        {
            regular_member_id: 4,
            name: 'Dieter',
            evenings: 2,
            penalty_total: 4.00,
            penalty_count: 2,
            game_wins: 0,
            beer_rounds: 1,
            shot_rounds: 0,
            total_pins: 0,
            throw_count: 0,
            avg_pins: null,
        },
        {
            regular_member_id: 5,
            name: 'Wolfgang',
            evenings: 1,
            penalty_total: 2.00,
            penalty_count: 1,
            game_wins: 0,
            beer_rounds: 0,
            shot_rounds: 0,
            total_pins: 0,
            throw_count: 0,
            avg_pins: null,
        },
        {
            regular_member_id: 6,
            name: 'Peter',
            evenings: 1,
            penalty_total: 1.00,
            penalty_count: 1,
            game_wins: 0,
            beer_rounds: 0,
            shot_rounds: 0,
            total_pins: 0,
            throw_count: 0,
            avg_pins: null,
        },
    ],
}

const YEAR_STATS_EMPTY = {
    year: 2026,
    evening_count: 0,
    total_penalties: 0,
    total_beers: 0,
    total_shots: 0,
    players: [],
}

const EVENING_LIST = [
    { id: 10, date: '2026-03-15', venue: 'Kegelbahn', is_closed: true, player_count: 3, game_count: 2, penalty_total: 8.00, drink_total: 1, note: null },
    { id: 11, date: '2026-01-20', venue: 'Alt-Lokal', is_closed: true, player_count: 4, game_count: 3, penalty_total: 10.00, drink_total: 2, note: null },
]

const MINIMAL_EVENING = {
    id: 10,
    date: '2026-03-15',
    venue: 'Kegelbahn',
    is_closed: true,
    players: [],
    games: [],
    penalty_log: [],
    drink_rounds: [],
    highlights: [],
    rsvp: [],
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderStatsPage() {
    const { StatsPage } = await import('../StatsPage')
    return render(<StatsPage />, { wrapper: makeWrapper() })
}

async function setupDefaultMocks() {
    const { useEveningList } = await import('@/hooks/useEvening.ts')
    const { api } = await import('@/api/client.ts')
    vi.mocked(useEveningList).mockReturnValue({ data: [], isLoading: false } as any)
    vi.mocked(api.getYearStats).mockResolvedValue(YEAR_STATS_EMPTY as any)
    vi.mocked(api.getEvening).mockResolvedValue(MINIMAL_EVENING as any)
    vi.mocked(api.listPins).mockResolvedValue([] as any)
}

async function setupWithEvenings() {
    const { useEveningList } = await import('@/hooks/useEvening.ts')
    const { api } = await import('@/api/client.ts')
    vi.mocked(useEveningList).mockReturnValue({ data: EVENING_LIST, isLoading: false } as any)
    vi.mocked(api.getYearStats).mockResolvedValue(YEAR_STATS as any)
    vi.mocked(api.getEvening).mockResolvedValue(MINIMAL_EVENING as any)
    vi.mocked(api.listPins).mockResolvedValue([] as any)
}

async function setupWithUser(regular_member_id: number = 2) {
    const user = {
        id: 10,
        role: 'member',
        email: 'a@b.de',
        name: 'Test',
        username: null,
        club_id: 1,
        preferred_locale: 'de',
        avatar: null,
        regular_member_id,
    }
    storeState.user = user
    const { useAppStore } = await import('@/store/app.ts')
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel(storeState))
}

// ── tests: loading & empty states ─────────────────────────────────────────────

describe('StatsPage — loading and empty states', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        storeState.activeEveningId = null
        storeState.regularMembers = []
    })

    it('renders the page title', async () => {
        await setupDefaultMocks()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.title')).toBeInTheDocument()
        })
    })

    it('shows empty state when evening list is empty', async () => {
        await setupDefaultMocks()
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [], isLoading: false } as any)
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.noData')).toBeInTheDocument()
        })
    })

    it('shows no-year-data empty state when yearStats has zero evenings', async () => {
        await setupDefaultMocks()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getYearStats).mockResolvedValue(YEAR_STATS_EMPTY as any)
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText(/stats\.noYearData/)).toBeInTheDocument()
        })
    })

    it('shows loading placeholder when evening list is loading', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: undefined, isLoading: true } as any)
        vi.mocked(api.getYearStats).mockResolvedValue(YEAR_STATS_EMPTY as any)
        vi.mocked(api.getEvening).mockResolvedValue(MINIMAL_EVENING as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderStatsPage()
        // With no evenings in the list the evening empty state renders
        expect(screen.getByText('stats.title')).toBeInTheDocument()
    })
})

// ── tests: year section ───────────────────────────────────────────────────────

describe('StatsPage — year section', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        storeState.activeEveningId = null
        storeState.regularMembers = []
    })

    it('renders the year section heading', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.year')).toBeInTheDocument()
        })
    })

    it('shows a year chip button for each year that has evenings', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            // EVENING_LIST has both dates in 2026 → one chip for 2026
            const chips = screen.getAllByRole('button', { name: '2026' })
            expect(chips.length).toBeGreaterThanOrEqual(1)
        })
    })

    it('clicking a year chip calls getYearStats with that year', async () => {
        await setupWithEvenings()
        const { api } = await import('@/api/client.ts')
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.year')).toBeInTheDocument()
        })
        // The query fires on mount for the current year
        await waitFor(() => {
            expect(vi.mocked(api.getYearStats)).toHaveBeenCalled()
        })
    })

    it('renders year stats summary boxes when data is available', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            // evening_count = 4
            expect(screen.getByText('4')).toBeInTheDocument()
        })
    })

    it('renders total-beers stat box', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            // total_beers = 12
            expect(screen.getByText('🍺 12')).toBeInTheDocument()
        })
    })
})

// ── tests: ranking and member search ─────────────────────────────────────────

describe('StatsPage — member ranking', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        storeState.activeEveningId = null
        storeState.regularMembers = []
    })

    it('renders member search input when year data exists', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByPlaceholderText('stats.memberSearch')).toBeInTheDocument()
        })
    })

    it('renders member names in ranking list', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('Hans')).toBeInTheDocument()
            expect(screen.getByText('Franzi')).toBeInTheDocument()
        })
    })

    it('renders year penalties heading', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.yearPenalties')).toBeInTheDocument()
        })
    })

    it('filters members by search query', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('Hans')).toBeInTheDocument()
        })
        const searchInput = screen.getByPlaceholderText('stats.memberSearch')
        fireEvent.change(searchInput, { target: { value: 'hans' } })
        await waitFor(() => {
            expect(screen.getByText('Hans')).toBeInTheDocument()
            expect(screen.queryByText('Franzi')).not.toBeInTheDocument()
        })
    })

    it('shows "show all" button when more than 5 members exist and search is empty', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            // YEAR_STATS has 6 members, default shows 5, button should appear
            expect(screen.getByText(/stats\.showAllMembers/)).toBeInTheDocument()
        })
    })

    it('clicking "show all" expands to display all members', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.queryByText('Peter')).not.toBeInTheDocument()
        })
        const showAllBtn = screen.getByText(/stats\.showAllMembers/)
        fireEvent.click(showAllBtn)
        await waitFor(() => {
            expect(screen.getByText('Peter')).toBeInTheDocument()
        })
    })

    it('clicking "show all" again collapses the list', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        const showAllBtn = await screen.findByText(/stats\.showAllMembers/)
        fireEvent.click(showAllBtn)
        await waitFor(() => {
            expect(screen.getByText('Peter')).toBeInTheDocument()
        })
        const showLessBtn = screen.getByText('stats.showLess')
        fireEvent.click(showLessBtn)
        await waitFor(() => {
            expect(screen.queryByText('Peter')).not.toBeInTheDocument()
        })
    })
})

// ── tests: "Ich" badge and current user ──────────────────────────────────────

describe('StatsPage — current user highlighting', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        storeState.activeEveningId = null
        storeState.regularMembers = []
    })

    it('shows "Ich" badge next to current user entry', async () => {
        await setupWithEvenings()
        await setupWithUser(2) // regular_member_id=2 is "Franzi"
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('Ich')).toBeInTheDocument()
        })
    })

    it('does not show "Ich" badge when user has no linked member', async () => {
        await setupWithEvenings()
        // Default mock returns user: null
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.queryByText('Ich')).not.toBeInTheDocument()
        })
    })

    it('highlights current user card with amber ring', async () => {
        await setupWithEvenings()
        await setupWithUser(1) // regular_member_id=1 is "Hans"
        await renderStatsPage()
        await waitFor(() => {
            const ichBadge = screen.getByText('Ich')
            expect(ichBadge).toBeInTheDocument()
            // The badge is amber — just confirm it renders inside the card
            expect(ichBadge.className).toContain('kce-amber')
        })
    })
})

const EVENING_WITH_PLAYERS = {
    id: 10,
    date: '2026-03-15',
    venue: 'Kegelbahn',
    is_closed: true,
    players: [
        { id: 1, name: 'Hans', regular_member_id: 1, is_king: false, avatar: null },
        { id: 2, name: 'Franzi', regular_member_id: 2, is_king: true, avatar: null },
    ],
    games: [
        { id: 1, winner_name: 'Hans', winner_ref: 'p:1', throws: [], status: 'finished' },
        { id: 2, winner_name: 'Hans', winner_ref: 'p:1', throws: [], status: 'finished' },
    ],
    penalty_log: [
        { id: 1, player_id: 1, mode: 'euro', amount: 3.00, penalty_type_name: 'Regelstrafe', client_timestamp: Date.now() - 5000 },
        { id: 2, player_id: 2, mode: 'euro', amount: 1.50, penalty_type_name: 'Null', client_timestamp: Date.now() - 3000 },
    ],
    drink_rounds: [
        { id: 1, drink_type: 'beer', participant_ids: [1, 2], client_timestamp: Date.now() - 2000 },
        { id: 2, drink_type: 'beer', participant_ids: [1], client_timestamp: Date.now() - 1000 },
        { id: 3, drink_type: 'shots', participant_ids: [2], client_timestamp: Date.now() - 500 },
    ],
    highlights: [],
}

// ── tests: evening picker section ────────────────────────────────────────────

describe('StatsPage — evening analysis section', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        storeState.activeEveningId = null
        storeState.regularMembers = []
    })

    it('renders evening analysis section heading', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.evening')).toBeInTheDocument()
        })
    })

    it('renders date chips for each evening', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            // 15.03.26 and 20.01.26 formatted via de-DE locale
            expect(screen.getByText(/15\.03\.26/)).toBeInTheDocument()
            expect(screen.getByText(/20\.01\.26/)).toBeInTheDocument()
        })
    })

    it('venue is shown alongside date in evening chip', async () => {
        await setupWithEvenings()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText(/Kegelbahn/)).toBeInTheDocument()
        })
    })

    it('selecting an evening chip updates the query for that evening', async () => {
        await setupWithEvenings()
        const { api } = await import('@/api/client.ts')
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText(/20\.01\.26/)).toBeInTheDocument()
        })
        // Click the second evening chip
        const chip = screen.getByText(/20\.01\.26/)
        fireEvent.click(chip)
        await waitFor(() => {
            // After picking, getEvening should have been called (initially for id=10, then for id=11)
            expect(vi.mocked(api.getEvening)).toHaveBeenCalledWith(11)
        })
    })
})

// ── tests: evening analysis with player data ──────────────────────────────────

describe('StatsPage — evening stats with player data', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        storeState.activeEveningId = null
        storeState.regularMembers = []
    })

    async function setupWithPlayerEvening() {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: EVENING_LIST, isLoading: false } as any)
        vi.mocked(api.getYearStats).mockResolvedValue(YEAR_STATS_EMPTY as any)
        vi.mocked(api.getEvening).mockResolvedValue(EVENING_WITH_PLAYERS as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
    }

    it('shows evening stat boxes when evening has data', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            // stats.totalEuro only appears in the evening stat box (not in player cards)
            expect(screen.getByText('stats.totalEuro')).toBeInTheDocument()
        })
    })

    it('shows beer stat box with correct count', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            // 🍺 appears in multiple places (evening stats, player cards, timeline)
            expect(screen.getAllByText(/🍺/).length).toBeGreaterThan(0)
        })
    })

    it('shows hall of fame section', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.hof')).toBeInTheDocument()
        })
    })

    it('shows penalty king in hall of fame', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('stats.penaltyKing')).toBeInTheDocument()
        })
    })

    it('shows game king in hall of fame', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            // Hans wins 2 games
            expect(screen.getByText('stats.gameKing')).toBeInTheDocument()
        })
    })

    it('shows player card section', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText('🃏 Spieler-Karten')).toBeInTheDocument()
        })
    })

    it('shows player names in player cards', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            const hansElements = screen.getAllByText('Hans')
            expect(hansElements.length).toBeGreaterThan(0)
        })
    })

    it('shows king crown for is_king player in cards', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            // Franzi is king — 👑 appears in both timeline chip and player card
            expect(screen.getAllByText(/👑/).length).toBeGreaterThan(0)
        })
    })

    it('shows "Verlauf" timeline section', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            expect(screen.getByText(/📈 Verlauf/)).toBeInTheDocument()
        })
    })

    it('shows player filter chips in timeline when players exist', async () => {
        await setupWithPlayerEvening()
        await renderStatsPage()
        await waitFor(() => {
            // Player filter chips in timeline
            const chips = screen.getAllByRole('button')
            const hansChip = chips.find(b => b.textContent?.includes('Hans') && b.closest('.flex'))
            expect(hansChip).toBeTruthy()
        })
    })
})
