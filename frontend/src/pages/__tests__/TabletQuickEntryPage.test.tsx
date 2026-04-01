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

// ─────────────────────────────────────────────────────────────────────────────
// Penalty logging
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — penalty logging', () => {
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
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addPenalty).mockResolvedValue([] as any)
    })

    it('calls api.addPenalty when player selected and penalty button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // Select a player
        fireEvent.click(screen.getByText('Admin'))
        // Click penalty button (🍺 Bier)
        await waitFor(() => {
            fireEvent.click(screen.getByText(/🍺 Bier/))
        })
        await waitFor(() => {
            expect(api.addPenalty).toHaveBeenCalledWith(42, expect.objectContaining({
                player_ids: [10],
                penalty_type_name: 'Bier',
                icon: '🍺',
                mode: 'count',
            }))
        })
    })

    it('does not call api.addPenalty when no player selected', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // Do NOT select a player, just click penalty
        fireEvent.click(screen.getByText(/🍺 Bier/))
        await waitFor(() => expect(api.addPenalty).not.toHaveBeenCalled())
    })

    it('calls api.addPenalty with multiple player ids when multiple selected', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText('Admin'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => {
            fireEvent.click(screen.getByText(/🍺 Bier/))
        })
        await waitFor(() => {
            expect(api.addPenalty).toHaveBeenCalledWith(42, expect.objectContaining({
                player_ids: expect.arrayContaining([10, 11]),
            }))
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Drink logging
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — drink logging', () => {
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
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addDrinkRound).mockResolvedValue({} as any)
    })

    it('calls api.addDrinkRound beer when player selected and beer button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText('Admin'))
        fireEvent.click(screen.getByTitle('drinks.beer'))
        await waitFor(() => {
            expect(api.addDrinkRound).toHaveBeenCalledWith(42, expect.objectContaining({
                drink_type: 'beer',
                participant_ids: [10],
            }))
        })
    })

    it('calls api.addDrinkRound shots when player selected and shots button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText('Admin'))
        fireEvent.click(screen.getByTitle('drinks.shots'))
        await waitFor(() => {
            expect(api.addDrinkRound).toHaveBeenCalledWith(42, expect.objectContaining({
                drink_type: 'shots',
                participant_ids: [10],
            }))
        })
    })

    it('does not call api.addDrinkRound when no player selected', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByTitle('drinks.beer'))
        await waitFor(() => expect(api.addDrinkRound).not.toHaveBeenCalled())
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Select all / none
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — select all / none', () => {
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

    it('selects all players when action.all clicked', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText('action.all'))
        await waitFor(() => {
            expect(screen.getByText(/2 quickEntry\.selected/)).toBeInTheDocument()
        })
    })

    it('deselects all when action.none clicked after selecting', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText('action.all'))
        await waitFor(() => screen.getByText(/quickEntry\.selected/))
        fireEvent.click(screen.getByText('action.none'))
        await waitFor(() => {
            expect(screen.getByText('quickEntry.selectPlayer')).toBeInTheDocument()
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Finish game flow
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — finish game flow', () => {
    const RUNNING_GAME = {
        id: 1, name: 'Hauptspiel', status: 'running', is_opener: true,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 2.00,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: 'alternating',
        started_at: '2026-01-10T20:30:00', finished_at: null,
        note: '', is_deleted: false, game_players: [], throws: [], active_player_id: null,
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
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.finishGame).mockResolvedValue(undefined as any)
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
    })

    it('opens finish game panel when finish button clicked', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => {
            expect(screen.getByText(/quickEntry\.selectWinner/)).toBeInTheDocument()
        })
    })

    it('shows player names as winner options', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => {
            expect(screen.getAllByText('Admin').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Hansi').length).toBeGreaterThan(0)
        })
    })

    it('calls api.finishGame when winner selected and confirm clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => screen.getByText(/quickEntry\.selectWinner/))
        // Select winner (Admin, player id 10, ref = p:10) — chip in the finish panel.
        // The finish panel is rendered BEFORE the three-column player list in the DOM,
        // so the first match of 'Admin' is the finish panel chip button.
        const winnerButtons = screen.getAllByText('Admin')
        fireEvent.click(winnerButtons[0])
        // Wait for the submit button to become enabled (winnerRef state update)
        await waitFor(() => expect(screen.getByText(/game\.finish/)).not.toBeDisabled())
        fireEvent.click(screen.getByText(/game\.finish/))
        await waitFor(() => {
            expect(api.finishGame).toHaveBeenCalledWith(42, 1, expect.objectContaining({
                winner_ref: 'p:10',
                winner_name: 'Admin',
            }))
        })
    })

    it('closes finish panel when cancel clicked', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => screen.getByText(/quickEntry\.selectWinner/))
        fireEvent.click(screen.getByText('action.cancel'))
        await waitFor(() => {
            expect(screen.queryByText(/quickEntry\.selectWinner/)).not.toBeInTheDocument()
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Throw strip
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — throw strip', () => {
    const RUNNING_GAME_WITH_THROWS = {
        id: 1, name: 'Hauptspiel', status: 'running', is_opener: true,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 2.00,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: 'alternating',
        started_at: '2026-01-10T20:30:00', finished_at: null,
        note: '', is_deleted: false, game_players: [],
        active_player_id: null,
        throws: [
            { id: 1, throw_num: 1, pins: 7, cumulative: 7, pin_states: Array(9).fill(false), player_id: 10 },
            { id: 2, throw_num: 2, pins: 5, cumulative: 12, pin_states: Array(9).fill(false), player_id: 11 },
        ],
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithGame = { ...ACTIVE_EVENING, games: [RUNNING_GAME_WITH_THROWS] }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithGame as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
        vi.mocked(api.deleteCameraThrow).mockResolvedValue(undefined as any)
    })

    it('shows throw numbers in strip', async () => {
        await renderTabletQuickEntry()
        // Throws strip shows #1, #2
        expect(screen.getByText('#1')).toBeInTheDocument()
        expect(screen.getByText('#2')).toBeInTheDocument()
    })

    it('shows pin counts in strip', async () => {
        await renderTabletQuickEntry()
        // pins 7 and 5 shown
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('calls api.deleteCameraThrow when void button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // Each throw card has a ✕ void button; first is #2 (newest first), second is #1
        const voidBtns = screen.getAllByTitle('quickEntry.voidThrow')
        fireEvent.click(voidBtns[0])
        await waitFor(() => {
            expect(api.deleteCameraThrow).toHaveBeenCalledWith(42, 1, expect.any(Number))
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Recent event deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — recent event deletion', () => {
    const EVENING_WITH_LOG = {
        ...ACTIVE_EVENING,
        penalty_log: [
            {
                id: 101, player_id: 10, player_name: 'Admin', penalty_type_name: 'Bier',
                icon: '🍺', amount: 1, mode: 'count', unit_amount: 1.00,
                game_id: null, note: null, client_timestamp: Date.now() - 60000, created_at: new Date().toISOString(),
            },
        ],
        drink_rounds: [],
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: EVENING_WITH_LOG as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deletePenalty).mockResolvedValue(undefined as any)
    })

    it('shows recent events section label', async () => {
        await renderTabletQuickEntry()
        // recentEvents.length > 0 causes the section to render
        expect(screen.getByText('quickEntry.recent')).toBeInTheDocument()
    })

    it('confirms before deleting — first click shows 🗑 icon', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // The recent event button initially shows the event icon (🍺).
        // Find it by its accessible name which includes 'Admin' (label span).
        // The player column also has an 'Admin' button, so take the last match.
        const adminBtns = screen.getAllByRole('button', { name: /Admin/ })
        fireEvent.click(adminBtns[adminBtns.length - 1]) // first click → confirming
        // After first click the button switches to 🗑 icon — API not yet called
        await waitFor(() => expect(screen.getByText('🗑')).toBeInTheDocument())
        expect(api.deletePenalty).not.toHaveBeenCalled()
    })

    it('calls api.deletePenalty on second click (confirmed)', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // First click: event button → sets confirmingKey (shows 🗑 icon)
        const adminBtns = screen.getAllByRole('button', { name: /Admin/ })
        fireEvent.click(adminBtns[adminBtns.length - 1])
        await waitFor(() => screen.getByText('🗑'))
        // Second click on the same button (now the 🗑 icon's parent button)
        fireEvent.click(screen.getByText('🗑').closest('button')!)
        await waitFor(() => {
            expect(api.deletePenalty).toHaveBeenCalledWith(42, 101)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Start game (open game)
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — start game', () => {
    const OPEN_GAME = {
        id: 3, name: 'Eröffnungsspiel', status: 'open', is_opener: true,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 0,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: 'alternating',
        started_at: null, finished_at: null,
        note: '', is_deleted: false, game_players: [], throws: [], active_player_id: null,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithOpenGame = { ...ACTIVE_EVENING, games: [OPEN_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithOpenGame as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.startGame).mockResolvedValue(undefined as any)
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
    })

    it('shows start game button for admin with open game', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText(/game\.start/)).toBeInTheDocument()
    })

    it('calls api.startGame when start button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/game\.start/))
        await waitFor(() => {
            expect(api.startGame).toHaveBeenCalledWith(42, 3)
        })
    })
})
