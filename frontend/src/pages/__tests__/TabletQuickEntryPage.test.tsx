import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: vi.fn(() => ({
        evening: null,
        invalidate: vi.fn(),
    })),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel?: any) => {
        const store = {
            user: null,
            penaltyTypes: [],
        }
        return sel ? sel(store) : store
    }),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        addPenalty: vi.fn(),
        deletePenalty: vi.fn(),
        addDrinkRound: vi.fn(),
        deleteDrinkRound: vi.fn(),
        startGame: vi.fn(),
        finishGame: vi.fn(),
        setActivePlayer: vi.fn(),
        deleteCameraThrow: vi.fn(),
        updateCameraThrow: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/lib/turnOrder.ts', () => ({
    buildTurnOrder: vi.fn(() => []),
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_USER = {
    id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin',
    username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const PENALTY_TYPES = [
    { id: 1, icon: '🍺', name: 'Bier', default_amount: 1.00, sort_order: 1, mode: 'euro' },
    { id: 2, icon: '⚠️', name: 'Strafe', default_amount: 0.50, sort_order: 2, mode: 'count' },
]

const PLAYERS = [
    { id: 10, user_id: 1, regular_member_id: 1, display_name: 'Admin', name: 'Admin', is_king: false, team_id: null, is_present: true },
    { id: 11, user_id: 2, regular_member_id: 2, display_name: 'Hansi', name: 'Hansi', is_king: false, team_id: null, is_present: true },
]

const ACTIVE_EVENING = {
    id: 42,
    date: '2026-01-10T00:00:00',
    venue: 'Stammtisch',
    is_closed: false,
    is_deleted: false,
    created_by: 1,
    players: PLAYERS,
    teams: [],
    games: [],
    penalty_log: [],
    drink_rounds: [],
    highlights: [],
    player_count: 2,
    game_count: 0,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderTabletQuickEntry(props: Record<string, any> = {}) {
    const { TabletQuickEntryPage } = await import('../TabletQuickEntryPage')
    return render(
        <TabletQuickEntryPage
            eveningId={42}
            players={PLAYERS as any}
            onClose={vi.fn()}
            {...props}
        />,
        { wrapper: makeWrapper() }
    )
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — basic rendering', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
    })

    it('shows quick entry title', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText(/quickEntry\.title/)).toBeInTheDocument()
    })

    it('shows select player prompt when no players selected', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText('quickEntry.selectPlayer')).toBeInTheDocument()
    })

    it('shows close button', async () => {
        const onClose = vi.fn()
        await renderTabletQuickEntry({ onClose })
        // Close button is the ✕ in the header (no recent entries so it should be unique)
        expect(screen.queryAllByText('✕').length).toBeGreaterThan(0)
    })

    it('shows player list with names', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText('Admin')).toBeInTheDocument()
        expect(screen.getByText('Hansi')).toBeInTheDocument()
    })

    it('shows penalty type buttons', async () => {
        await renderTabletQuickEntry()
        // Penalty buttons render as "🍺 Bier", "⚠️ Strafe"
        expect(screen.getByText(/🍺 Bier/)).toBeInTheDocument()
        expect(screen.getByText(/⚠️ Strafe/)).toBeInTheDocument()
    })

    it('shows beer drink button', async () => {
        await renderTabletQuickEntry()
        // Drink buttons use title attribute, content is just emoji
        expect(screen.getByTitle('drinks.beer')).toBeInTheDocument()
    })
})

describe('TabletQuickEntryPage — player selection', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
    })

    it('shows selected count when player is selected', async () => {
        await renderTabletQuickEntry()
        // Click on first player
        fireEvent.click(screen.getByText('Admin'))
        await waitFor(() => {
            expect(screen.getByText(/quickEntry\.selected/)).toBeInTheDocument()
        })
    })

    it('shows Ich badge for current user', async () => {
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
        await renderTabletQuickEntry()
        expect(screen.getByText('Ich')).toBeInTheDocument()
    })
})

describe('TabletQuickEntryPage — running game', () => {
    const RUNNING_GAME = {
        id: 1, name: 'Hauptspiel', status: 'running', is_opener: true,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 2.00,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: 'alternating',
        started_at: '2026-01-10T20:30:00', finished_at: null,
        note: '', is_deleted: false, game_players: [],
        throws: [],
        active_player_id: null,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithGame = { ...ACTIVE_EVENING, games: [RUNNING_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithGame as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)  // admin to see finish game button
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
    })

    it('shows running game name in header', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText(/Hauptspiel/)).toBeInTheDocument()
    })

    it('shows finish game button for admin', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText(/quickEntry\.finishGame/)).toBeInTheDocument()
    })
})

describe('TabletQuickEntryPage — recent log entries', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithLog = {
            ...ACTIVE_EVENING,
            penalty_log: [
                {
                    id: 101, player_id: 10, player_name: 'Admin', penalty_type_name: 'Bier',
                    icon: '🍺', amount: 2, mode: 'count', unit_amount: 1.00,
                    game_id: null, note: null, client_timestamp: Date.now() - 60000, created_at: new Date().toISOString(),
                },
            ],
        }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithLog as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
    })

    it('shows recent penalty entries', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText(/Bier/)).toBeInTheDocument()
    })
})
