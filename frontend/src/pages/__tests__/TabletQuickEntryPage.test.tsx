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
            regularMembers: [],
            guestPenaltyCap: null,
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
        addGame: vi.fn(),
        startGame: vi.fn(),
        finishGame: vi.fn(),
        setActivePlayer: vi.fn(),
        deleteCameraThrow: vi.fn(),
        updateCameraThrow: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn() }))
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
    { id: 10, user_id: 1, regular_member_id: 1, display_name: 'Admin', name: 'Admin', is_king: false, team_id: 1, is_present: true },
    { id: 11, user_id: 2, regular_member_id: 2, display_name: 'Hansi', name: 'Hansi', is_king: false, team_id: 1, is_present: true },
]

const ACTIVE_EVENING = {
    id: 42,
    date: '2026-01-10T00:00:00',
    venue: 'Stammtisch',
    is_closed: false,
    is_deleted: false,
    created_by: 1,
    players: PLAYERS,
    // Teams are set up as the first step of configuring an evening, so they exist by default in these fixtures
    teams: [{ id: 1, name: 'Team A' }],
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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
        // Names appear in both column 1 (selection) and column 3 (overview)
        expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Hansi').length).toBeGreaterThanOrEqual(1)
    })

    it('shows penalty type buttons', async () => {
        await renderTabletQuickEntry()
        // Penalty buttons render as "🍺 Bier", "⚠️ Strafe"
        expect(screen.getByText(/🍺 Bier/)).toBeInTheDocument()
        expect(screen.getByText(/⚠️ Strafe/)).toBeInTheDocument()
    })

    it('shows drink buttons in the penalty panel', async () => {
        await renderTabletQuickEntry()
        // Drinks now live as inline buttons in column 2 (no header CTA, no sheet)
        expect(screen.getByText(/🍺 drinks\.beer/)).toBeInTheDocument()
        expect(screen.getByText(/🥃 drinks\.shots/)).toBeInTheDocument()
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
    })

    it('shows selected count when player is selected', async () => {
        await renderTabletQuickEntry()
        // Click first 'Admin' = the column-1 selection button
        fireEvent.click(screen.getAllByText('Admin')[0])
        await waitFor(() => {
            expect(screen.getByText(/quickEntry\.selected/)).toBeInTheDocument()
        })
    })

    it('shows Ich badge for current user', async () => {
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await renderTabletQuickEntry()
        // Ich badge appears in both selection column and overview column
        expect(screen.getAllByText('Ich').length).toBeGreaterThanOrEqual(1)
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
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addPenalty).mockResolvedValue([] as any)
    })

    it('calls api.addPenalty when player selected and penalty button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // Select a player (first match = column 1 selection button)
        fireEvent.click(screen.getAllByText('Admin')[0])
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

    it('deselects all players after successful penalty log', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getAllByText('Admin')[0])
        await waitFor(() => expect(screen.getByText(/1 quickEntry\.selected/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/🍺 Bier/))
        await waitFor(() => expect(screen.getByText('quickEntry.selectPlayer')).toBeInTheDocument())
    })

    it('calls api.addPenalty with multiple player ids when multiple selected', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getAllByText('Admin')[0])
        fireEvent.click(screen.getAllByText('Hansi')[0])
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

describe('TabletQuickEntryPage — drink logging (inline panel flow)', () => {
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addDrinkRound).mockResolvedValue({} as any)
    })

    it('calls api.addDrinkRound with beer + selected players when beer button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // Select a player in column 1, then tap the inline 🍺 button
        fireEvent.click(screen.getAllByText('Admin')[0])
        await waitFor(() => {
            fireEvent.click(screen.getByText(/🍺 drinks\.beer/))
        })
        await waitFor(() => {
            expect(api.addDrinkRound).toHaveBeenCalledWith(42, expect.objectContaining({
                drink_type: 'beer',
                participant_ids: [10],
            }))
        })
    })

    it('calls api.addDrinkRound with shots when shots button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getAllByText('Admin')[0])
        await waitFor(() => {
            fireEvent.click(screen.getByText(/🥃 drinks\.shots/))
        })
        await waitFor(() => {
            expect(api.addDrinkRound).toHaveBeenCalledWith(42, expect.objectContaining({
                drink_type: 'shots',
                participant_ids: [10],
            }))
        })
    })

    it('logs a drink round for multiple selected players', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getAllByText('Admin')[0])
        fireEvent.click(screen.getAllByText('Hansi')[0])
        await waitFor(() => {
            fireEvent.click(screen.getByText(/🍺 drinks\.beer/))
        })
        await waitFor(() => {
            expect(api.addDrinkRound).toHaveBeenCalledWith(42, expect.objectContaining({
                drink_type: 'beer',
                participant_ids: expect.arrayContaining([10, 11]),
            }))
        })
    })

    it('does not call api.addDrinkRound when no player selected', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        // No selection — the inline drink button is disabled
        fireEvent.click(screen.getByText(/🍺 drinks\.beer/))
        await waitFor(() => expect(api.addDrinkRound).not.toHaveBeenCalled())
    })

    it('deselects all players after a drink round is logged', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getAllByText('Admin')[0])
        await waitFor(() => expect(screen.getByText(/1 quickEntry\.selected/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/🍺 drinks\.beer/))
        await waitFor(() => expect(screen.getByText('quickEntry.selectPlayer')).toBeInTheDocument())
    })

    it('invalidates member-balances and guest-balances after logging a drink round', async () => {
        const { api } = await import('@/api/client.ts')
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { TabletQuickEntryPage } = await import('../TabletQuickEntryPage')
        render(
            <QueryClientProvider client={qc}>
                <TabletQuickEntryPage eveningId={42} players={PLAYERS as any} onClose={vi.fn()} />
            </QueryClientProvider>
        )
        fireEvent.click(screen.getAllByText('Admin')[0])
        await waitFor(() => {
            fireEvent.click(screen.getByText(/🍺 drinks\.beer/))
        })
        await waitFor(() => expect(api.addDrinkRound).toHaveBeenCalled())
        await waitFor(() => {
            expect(spy).toHaveBeenCalledWith({queryKey: ['member-balances']})
            expect(spy).toHaveBeenCalledWith({queryKey: ['guest-balances']})
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Per-player overview column
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — overview column', () => {
    const EVENING_WITH_PENALTIES = {
        ...ACTIVE_EVENING,
        penalty_log: [
            // Admin: 2× Bier (1.00) + 3× Strafe (0.50) → 2.00 + 1.50 = 3.50
            { id: 1, player_id: 10, player_name: 'Admin', penalty_type_name: 'Bier',
              icon: '🍺', amount: 2, mode: 'count', unit_amount: 1.00,
              game_id: null, note: null, client_timestamp: Date.now(), created_at: '' },
            { id: 2, player_id: 10, player_name: 'Admin', penalty_type_name: 'Strafe',
              icon: '⚠️', amount: 3, mode: 'count', unit_amount: 0.50,
              game_id: null, note: null, client_timestamp: Date.now(), created_at: '' },
            // Hansi: 1× Bier (1.00) → 1.00
            { id: 3, player_id: 11, player_name: 'Hansi', penalty_type_name: 'Bier',
              icon: '🍺', amount: 1, mode: 'count', unit_amount: 1.00,
              game_id: null, note: null, client_timestamp: Date.now(), created_at: '' },
        ],
        drink_rounds: [
            { id: 1, drink_type: 'beer', participant_ids: [10, 11], client_timestamp: Date.now() },
            { id: 2, drink_type: 'shots', participant_ids: [10], client_timestamp: Date.now() },
        ],
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: EVENING_WITH_PENALTIES as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
    })

    it('renders overview column heading', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText('quickEntry.overview')).toBeInTheDocument()
    })

    it('renders per-player penalty totals (count-mode + euro-mode), euro-formatted', async () => {
        await renderTabletQuickEntry()
        // Admin: 3.50 € — unique to overview (no penalty group has 3.50)
        expect(screen.getByText(/3,50/)).toBeInTheDocument()
        // Hansi: 1.00 € — appears as penalty group label too, so check ≥ 2 occurrences
        expect(screen.getAllByText(/1,00/).length).toBeGreaterThanOrEqual(2)
    })

    it('renders grand total of all penalties', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText('quickEntry.totalPenalty')).toBeInTheDocument()
        // Total = 3.50 + 1.00 = 4.50
        expect(screen.getByText(/4,50/)).toBeInTheDocument()
    })

    it('shows drink counts per player when drink rounds exist', async () => {
        await renderTabletQuickEntry()
        // Admin: 1 beer + 1 shot → "🍺 1" and "🥃 1" should appear
        expect(screen.getByText(/🥃 1/)).toBeInTheDocument()
        // Two players have "🍺 1" (Admin + Hansi participated in beer round)
        expect(screen.getAllByText(/🍺 1/).length).toBeGreaterThanOrEqual(2)
    })
})

describe('TabletQuickEntryPage — overview totals (no guest cap, present players only)', () => {
    // Admin (member): 7×0.50 = 3.50
    // Hansi (guest): 18×0.50 = 9.00 — shown in full, the treasury-only cap is NOT applied here
    // Absence entry (player_id null): 2.00 — excluded from the present-players overview
    const GUEST_PLAYERS = [
        { id: 10, user_id: 1, regular_member_id: 1, display_name: 'Admin', name: 'Admin', is_king: false, team_id: null, is_present: true },
        { id: 11, user_id: 2, regular_member_id: 2, display_name: 'Hansi', name: 'Hansi', is_king: false, team_id: null, is_present: true },
    ]
    const REGULAR_MEMBERS = [
        { id: 1, name: 'Admin', nickname: null, is_guest: false },
        { id: 2, name: 'Hansi', nickname: null, is_guest: true },
    ]
    const EVENING_WITH_GUEST = {
        ...ACTIVE_EVENING,
        players: GUEST_PLAYERS,
        penalty_log: [
            { id: 1, player_id: 10, player_name: 'Admin', penalty_type_name: 'Strafe',
              icon: '⚠️', amount: 7, mode: 'count', unit_amount: 0.50,
              game_id: null, note: null, client_timestamp: Date.now(), created_at: '' },
            { id: 2, player_id: 11, player_name: 'Hansi', penalty_type_name: 'Strafe',
              icon: '⚠️', amount: 18, mode: 'count', unit_amount: 0.50,
              game_id: null, note: null, client_timestamp: Date.now(), created_at: '' },
            // Retroactive absence entry (no present player)
            { id: 3, player_id: null, player_name: null, regular_member_id: 9, penalty_type_name: 'Abwesenheit',
              icon: '🚫', amount: 2.00, mode: 'euro', unit_amount: null,
              game_id: null, note: null, client_timestamp: Date.now(), created_at: '' },
        ],
        drink_rounds: [],
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: EVENING_WITH_GUEST as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: REGULAR_MEMBERS, guestPenaltyCap: 5.00 }
            return sel ? sel(store) : store
        })
    })

    it('Σ total sums present players uncapped, excluding absence entries', async () => {
        await renderTabletQuickEntry({ players: GUEST_PLAYERS })
        // Σ = Admin 3.50 + Hansi 9.00 (uncapped) = 12.50 — the 2.00 absence entry is NOT counted
        expect(screen.getByText('quickEntry.totalPenalty')).toBeInTheDocument()
        expect(screen.getByText(/12,50/)).toBeInTheDocument()
        expect(screen.queryByText(/14,50/)).not.toBeInTheDocument()
    })

    it('Ø average uses the actual penalties per present player', async () => {
        await renderTabletQuickEntry({ players: GUEST_PLAYERS })
        // Ø = (Admin 3.50 + Hansi 9.00) / 2 present players = 6.25
        expect(screen.getByText('quickEntry.averagePenalty')).toBeInTheDocument()
        expect(screen.getByText(/6,25/)).toBeInTheDocument()
    })

    it('guest row shows the real uncapped penalty, not the cap', async () => {
        await renderTabletQuickEntry({ players: GUEST_PLAYERS })
        // Hansi (guest) row shows the full 9.00 — the 5.00 cap is never applied here
        expect(screen.getByText(/9,00/)).toBeInTheDocument()
        expect(screen.queryByText(/5,00/)).not.toBeInTheDocument()
    })
})

describe('TabletQuickEntryPage — overview column with running game', () => {
    const RUNNING_GAME_WITH_THROWS = {
        id: 1, name: 'Hauptspiel', status: 'running', is_opener: true,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 2.00,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: 'alternating',
        started_at: '2026-01-10T20:30:00', finished_at: null,
        note: '', is_deleted: false, game_players: [],
        active_player_id: null,
        throws: [
            { id: 1, throw_num: 1, pins: 7, cumulative: 7, pin_states: Array(9).fill(false), player_id: 10 },
            { id: 2, throw_num: 2, pins: 5, cumulative: 12, pin_states: Array(9).fill(false), player_id: 10 },
        ],
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, games: [RUNNING_GAME_WITH_THROWS] } as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
    })

    it('shows current cumulative score for player with throws', async () => {
        await renderTabletQuickEntry()
        // Admin (player_id 10) → cumulative 12 from last throw
        expect(screen.getByText(/🎳 12/)).toBeInTheDocument()
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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

    it('shows a loser penalty preview once a winner is selected, even with per_point_penalty 0', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => screen.getByText(/quickEntry\.selectWinner/))
        expect(screen.queryByText(/game\.perPointPreview/)).not.toBeInTheDocument()
        const winnerButtons = screen.getAllByText('Admin')
        fireEvent.click(winnerButtons[0])
        await waitFor(() => {
            expect(screen.getByText(/game\.perPointPreview/)).toBeInTheDocument()
            expect(screen.getAllByText('Hansi').length).toBeGreaterThan(1)
            expect(screen.getAllByText(/2,00.€/).length).toBeGreaterThan(0)
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

    it('shows score inputs for each player in finish panel', async () => {
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => screen.getByText(/quickEntry\.selectWinner/))
        expect(screen.getByText(/game\.scores/)).toBeInTheDocument()
        const inputs = screen.getAllByPlaceholderText('0')
        expect(inputs.length).toBeGreaterThanOrEqual(2)
    })

    it('includes manually entered scores in api.finishGame call', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => screen.getByText(/quickEntry\.selectWinner/))
        const inputs = screen.getAllByPlaceholderText('0')
        fireEvent.change(inputs[0], { target: { value: '42' } })
        const winnerButtons = screen.getAllByText('Admin')
        fireEvent.click(winnerButtons[0])
        await waitFor(() => expect(screen.getByText(/game\.finish/)).not.toBeDisabled())
        fireEvent.click(screen.getByText(/game\.finish/))
        await waitFor(() => {
            expect(api.finishGame).toHaveBeenCalledWith(42, 1, expect.objectContaining({
                scores: expect.objectContaining({ 'p:10': 42 }),
            }))
        })
    })

    it('invalidates member-balances and guest-balances after finishing a game', async () => {
        const { api } = await import('@/api/client.ts')
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithGame = { ...ACTIVE_EVENING, games: [RUNNING_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithGame as any,
            invalidate: vi.fn(),
        } as any)
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { TabletQuickEntryPage } = await import('../TabletQuickEntryPage')
        render(
            <QueryClientProvider client={qc}>
                <TabletQuickEntryPage eveningId={42} players={PLAYERS as any} onClose={vi.fn()} />
            </QueryClientProvider>
        )
        fireEvent.click(screen.getByText(/quickEntry\.finishGame/))
        await waitFor(() => screen.getByText(/quickEntry\.selectWinner/))
        const winnerButtons = screen.getAllByText('Admin')
        fireEvent.click(winnerButtons[0])
        await waitFor(() => expect(screen.getByText(/game\.finish/)).not.toBeDisabled())
        fireEvent.click(screen.getByText(/game\.finish/))
        await waitFor(() => expect(api.finishGame).toHaveBeenCalled())
        await waitFor(() => {
            expect(spy).toHaveBeenCalledWith({queryKey: ['member-balances']})
            expect(spy).toHaveBeenCalledWith({queryKey: ['guest-balances']})
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// New game auto-start
// ─────────────────────────────────────────────────────────────────────────────

describe('TabletQuickEntryPage — new game auto-start', () => {
    const GAME_TEMPLATE = {
        id: 5, name: 'Hauptspiel', is_opener: false, winner_type: 'individual',
        turn_mode: 'alternating', default_loser_penalty: 2.00, per_point_penalty: 0,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, games: [] } as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, gameTemplates: [GAME_TEMPLATE], regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addGame).mockResolvedValue({ id: 99, name: 'Hauptspiel' } as any)
        vi.mocked(api.startGame).mockResolvedValue(undefined as any)
    })

    it('calls api.startGame immediately after api.addGame when creating a game', async () => {
        const { api } = await import('@/api/client.ts')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.newGame/))
        await waitFor(() => screen.getByText('Hauptspiel'))
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => {
            expect(api.addGame).toHaveBeenCalledWith(42, expect.objectContaining({
                name: 'Hauptspiel',
                template_id: 5,
            }))
            expect(api.startGame).toHaveBeenCalledWith(42, 99)
        })
    })
})

describe('TabletQuickEntryPage — new game auto-start blocked without teams', () => {
    // Deliberately winner_type: 'individual' — teams are set up once for the whole evening,
    // so the guard blocks auto-start for every template, not just team-mode ones.
    const GAME_TEMPLATE_NO_TEAMS = {
        id: 6, name: 'Warmup', is_opener: false, winner_type: 'individual',
        turn_mode: null, default_loser_penalty: 2.00, per_point_penalty: 0,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, teams: [], games: [] } as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, gameTemplates: [GAME_TEMPLATE_NO_TEAMS], regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addGame).mockResolvedValue({ id: 100, name: 'Warmup' } as any)
        vi.mocked(api.startGame).mockResolvedValue(undefined as any)
    })

    it('creates the game but does not auto-start it, showing a toast instead', async () => {
        const { api } = await import('@/api/client.ts')
        const { showToast } = await import('@/components/ui/Toast')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/quickEntry\.newGame/))
        await waitFor(() => screen.getByText('Warmup'))
        fireEvent.click(screen.getByText('Warmup'))
        await waitFor(() => {
            expect(api.addGame).toHaveBeenCalledWith(42, expect.objectContaining({
                name: 'Warmup',
                template_id: 6,
            }))
            expect(showToast).toHaveBeenCalledWith('game.teamsRequired', 'error')
        })
        expect(api.startGame).not.toHaveBeenCalled()
    })
})

describe('TabletQuickEntryPage — new game auto-start blocked when players unassigned', () => {
    const GAME_TEMPLATE_NO_TEAMS = {
        id: 7, name: 'Warmup', is_opener: false, winner_type: 'individual',
        turn_mode: null, default_loser_penalty: 2.00, per_point_penalty: 0,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: {
                ...ACTIVE_EVENING,
                teams: [{ id: 1, name: 'Team A' }],
                players: [{ ...PLAYERS[0], team_id: null }, { ...PLAYERS[1], team_id: null }],
                games: [],
            } as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, gameTemplates: [GAME_TEMPLATE_NO_TEAMS], regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addGame).mockResolvedValue({ id: 101, name: 'Warmup' } as any)
        vi.mocked(api.startGame).mockResolvedValue(undefined as any)
    })

    it('creates the game but does not auto-start it, showing a toast instead', async () => {
        const { api } = await import('@/api/client.ts')
        const { showToast } = await import('@/components/ui/Toast')
        const unassignedPlayers = [{ ...PLAYERS[0], team_id: null }, { ...PLAYERS[1], team_id: null }]
        await renderTabletQuickEntry({ players: unassignedPlayers })
        fireEvent.click(screen.getByText(/quickEntry\.newGame/))
        await waitFor(() => screen.getByText('Warmup'))
        fireEvent.click(screen.getByText('Warmup'))
        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith('team.cannotStartUnassigned', 'error')
        })
        expect(api.startGame).not.toHaveBeenCalled()
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
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
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

describe('TabletQuickEntryPage — start game blocked without teams', () => {
    // Deliberately winner_type: 'individual' — the teams-required guard applies to every
    // game, not just team-mode ones, since teams are set up once for the whole evening.
    const OPEN_INDIVIDUAL_GAME = {
        id: 4, name: 'Warmup 2', status: 'open', is_opener: false,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 0,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: null,
        started_at: null, finished_at: null,
        note: '', is_deleted: false, game_players: [], throws: [], active_player_id: null,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        // No teams on the evening — no game (individual or team) must be startable
        const eveningWithOpenTeamGame = { ...ACTIVE_EVENING, teams: [], games: [OPEN_INDIVIDUAL_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithOpenTeamGame as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.startGame).mockResolvedValue(undefined as any)
    })

    it('shows the teams-required warning banner', async () => {
        await renderTabletQuickEntry()
        expect(screen.getByText('game.teamsRequired')).toBeInTheDocument()
    })

    it('does not call api.startGame and shows a toast when start button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        const { showToast } = await import('@/components/ui/Toast')
        await renderTabletQuickEntry()
        fireEvent.click(screen.getByText(/game\.start/))
        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith('game.teamsRequired', 'error')
        })
        expect(api.startGame).not.toHaveBeenCalled()
    })
})

describe('TabletQuickEntryPage — start game blocked when players unassigned', () => {
    const OPEN_INDIVIDUAL_GAME = {
        id: 5, name: 'Warmup 3', status: 'open', is_opener: false,
        sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 0,
        per_point_penalty: 0, winner_type: 'individual', turn_mode: null,
        started_at: null, finished_at: null,
        note: '', is_deleted: false, game_players: [], throws: [], active_player_id: null,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithUnassigned = {
            ...ACTIVE_EVENING,
            teams: [{ id: 1, name: 'Team A' }],
            players: [{ ...PLAYERS[0], team_id: null }, { ...PLAYERS[1], team_id: null }],
            games: [OPEN_INDIVIDUAL_GAME],
        }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithUnassigned as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.startGame).mockResolvedValue(undefined as any)
    })

    it('shows the unassigned-players warning banner', async () => {
        await renderTabletQuickEntry({ players: [{ ...PLAYERS[0], team_id: null }, { ...PLAYERS[1], team_id: null }] })
        expect(screen.getByText(/team\.playersUnassigned/)).toBeInTheDocument()
    })

    it('does not call api.startGame and shows a toast when start button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        const { showToast } = await import('@/components/ui/Toast')
        await renderTabletQuickEntry({ players: [{ ...PLAYERS[0], team_id: null }, { ...PLAYERS[1], team_id: null }] })
        fireEvent.click(screen.getByText(/game\.start/))
        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith('team.cannotStartUnassigned', 'error')
        })
        expect(api.startGame).not.toHaveBeenCalled()
    })
})
