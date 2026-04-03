import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: vi.fn(() => ({ evening: null, invalidate: vi.fn() })),
    useEveningList: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({
        user: null,
        gameTemplates: [],
        regularMembers: [],
    })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        addGame: vi.fn(),
        startGame: vi.fn(),
        finishGame: vi.fn(),
        updateGame: vi.fn(),
        deleteGame: vi.fn(),
        updateEvening: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/components/ui/Empty.tsx', () => ({
    Empty: ({ text }: any) => <div>{text}</div>,
}))
vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({ open, children, title, onClose, onSubmit }: any) =>
        open ? (
            <div data-testid="sheet">
                <div data-testid="sheet-title">{title}</div>
                <button onClick={onClose}>close-sheet</button>
                {onSubmit && <button onClick={onSubmit}>submit-sheet</button>}
                {children}
            </div>
        ) : null,
}))
vi.mock('@/components/ui/ModeToggle.tsx', () => ({
    ModeToggle: ({ value, onChange, options }: any) => (
        <div>
            {options?.map((o: any) => (
                <button key={o.value} onClick={() => onChange(o.value)}>{o.label}</button>
            ))}
        </div>
    ),
}))
vi.mock('@/components/ui/ChipSelect.tsx', () => ({
    ChipSelect: ({ options, onChange }: any) => (
        <div>
            {options?.map((o: any) => (
                <button key={o.value} onClick={() => onChange(o.value)}>{o.label}</button>
            ))}
        </div>
    ),
}))
// Mock CameraCapturePage to avoid complex dependencies
vi.mock('../CameraCapturePage', () => ({ CameraCapturePage: () => null }))

// ── fixtures ──────────────────────────────────────────────────────────────────

const PLAYERS = [
    { id: 1, user_id: 10, regular_member_id: 1, display_name: 'Hans', name: 'Hans', is_king: false, team_id: null },
    { id: 2, user_id: 11, regular_member_id: 2, display_name: 'Franz', name: 'Franz', is_king: false, team_id: null },
]

const OPEN_GAME = {
    id: 1, name: 'Warmup', status: 'open', is_opener: false, is_president: false,
    sort_order: 1, winner_ref: null, scores: {}, loser_penalty: 2.00,
    per_point_penalty: 0, winner_type: 'individual', turn_mode: 'alternating',
    started_at: null, finished_at: null, note: '', is_deleted: false, game_players: [],
}

const RUNNING_GAME = {
    ...OPEN_GAME, id: 2, name: 'Hauptspiel', status: 'running', is_opener: true,
    sort_order: 2, started_at: '2026-01-10T20:30:00',
}

const FINISHED_GAME = {
    ...OPEN_GAME, id: 3, name: 'Finales Spiel', status: 'finished',
    sort_order: 3, winner_ref: '1', finished_at: '2026-01-10T21:30:00',
}

const ACTIVE_EVENING = {
    id: 42, date: '2026-01-10', venue: 'Stammtisch',
    is_closed: false, is_deleted: false, created_by: 1,
    players: PLAYERS,
    teams: [],
    games: [OPEN_GAME, RUNNING_GAME, FINISHED_GAME],
    player_count: 2, game_count: 3,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderGamesPage() {
    const { GamesPage } = await import('../GamesPage')
    return render(<GamesPage />, { wrapper: makeWrapper() })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GamesPage — no active evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: null, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('shows games heading', async () => {
        await renderGamesPage()
        expect(screen.getByText(/nav\.games/)).toBeInTheDocument()
    })

    it('shows evening.noActive empty state', async () => {
        await renderGamesPage()
        expect(screen.getByText('evening.noActive')).toBeInTheDocument()
    })
})

describe('GamesPage — with active evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('shows game list', async () => {
        await renderGamesPage()
        expect(screen.getByText('Warmup')).toBeInTheDocument()
        // Opener game has crown emoji prefix: "👑 Hauptspiel" → use regex
        expect(screen.getByText(/Hauptspiel/)).toBeInTheDocument()
        expect(screen.getByText('Finales Spiel')).toBeInTheDocument()
    })

    it('shows add game button', async () => {
        await renderGamesPage()
        expect(screen.getByText(/game\.add/)).toBeInTheDocument()
    })

    it('shows running game timer', async () => {
        await renderGamesPage()
        // Running game should show a timer (⏱)
        expect(screen.getByText(/⏱/)).toBeInTheDocument()
    })

    it('shows opener crown icon for opener game', async () => {
        await renderGamesPage()
        expect(screen.getByText(/👑/)).toBeInTheDocument()
    })

    it('admin sees camera button', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'admin', email: 'a@b.de', name: 'Admin', regular_member_id: 1 },
            gameTemplates: [],
            regularMembers: [],
        }))
        await renderGamesPage()
        expect(screen.getByTitle('camera.title')).toBeInTheDocument()
    })

    it('non-admin does not see camera button', async () => {
        await renderGamesPage()
        expect(screen.queryByTitle('camera.title')).not.toBeInTheDocument()
    })

    it('opens add game sheet when button clicked', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows start button for open games', async () => {
        await renderGamesPage()
        // Open game should have a start button
        expect(screen.getAllByText(/game\.start/)[0]).toBeInTheDocument()
    })

    it('shows finish button for running game', async () => {
        await renderGamesPage()
        expect(screen.getAllByText(/game\.finish/)[0]).toBeInTheDocument()
    })
})

describe('GamesPage — empty games', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithoutGames = { ...ACTIVE_EVENING, games: [] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningWithoutGames as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('shows game.none empty state when no games', async () => {
        await renderGamesPage()
        expect(screen.getByText('game.none')).toBeInTheDocument()
    })
})

describe('GamesPage — add game sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('shows game name input in add sheet', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => {
            expect(screen.getByPlaceholderText('game.name')).toBeInTheDocument()
        })
    })

    it('shows winner type chips in add sheet', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => {
            expect(screen.getByText(/club\.template\.winnerType\.individual/)).toBeInTheDocument()
            expect(screen.getByText(/club\.template\.winnerType\.team/)).toBeInTheDocument()
        })
    })

    it('shows loser penalty input in add sheet', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => {
            expect(screen.getByText('game.loserPenalty')).toBeInTheDocument()
        })
    })

    it('shows opener toggle in add sheet', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        // No opener exists yet
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, games: [] } as any, invalidate: vi.fn(),
        } as any)
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => {
            expect(screen.getByText(/game\.isOpener/)).toBeInTheDocument()
        })
    })

    it('shows template chips when templates exist', async () => {
        const { useAppStore } = await import('@/store/app.ts')
        const templates = [
            { id: 1, name: 'Eröffnungsspiel', is_opener: true, default_loser_penalty: 2.00, winner_type: 'individual', turn_mode: null, per_point_penalty: 0 },
        ]
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: templates, regularMembers: [] }))
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => {
            expect(screen.getByText(/Eröffnungsspiel/)).toBeInTheDocument()
        })
    })

    it('calls api.addGame on submit', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addGame).mockResolvedValueOnce({} as any)
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => screen.getByPlaceholderText('game.name'))
        fireEvent.change(screen.getByPlaceholderText('game.name'), { target: { value: 'Testspiel' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.addGame).toHaveBeenCalledWith(42, expect.objectContaining({ name: 'Testspiel' }))
        })
    })

    it('shows turn mode chips when team winner type selected', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        await waitFor(() => screen.getByText(/club\.template\.winnerType\.team/))
        fireEvent.click(screen.getByText(/club\.template\.winnerType\.team/))
        await waitFor(() => {
            expect(screen.getByText(/game\.turnMode\.alternating/)).toBeInTheDocument()
        })
    })
})

describe('GamesPage — finish game sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('opens finish sheet when finish button clicked', async () => {
        await renderGamesPage()
        // Running game has finish button
        fireEvent.click(screen.getAllByText(/game\.finish/)[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows player names as winner options in finish sheet', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getAllByText(/game\.finish/)[0])
        await waitFor(() => {
            expect(screen.getAllByText('Hans').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Franz').length).toBeGreaterThan(0)
        })
    })

    it('shows loser penalty in finish sheet', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getAllByText(/game\.finish/)[0])
        await waitFor(() => {
            expect(screen.getByText('game.loserPenalty')).toBeInTheDocument()
        })
    })

    it('calls api.finishGame on submit with winner selected', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.finishGame).mockResolvedValueOnce({} as any)
        await renderGamesPage()
        fireEvent.click(screen.getAllByText(/game\.finish/)[0])
        await waitFor(() => expect(screen.getAllByText('Hans').length).toBeGreaterThan(0))
        // Click the chip button (first Hans = the winner chip)
        const hansButtons = screen.getAllByRole('button', { name: 'Hans' })
        fireEvent.click(hansButtons[0])
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.finishGame).toHaveBeenCalledWith(42, 2, expect.objectContaining({ winner_ref: 'p:1' }))
        })
    })

    it('opens edit result sheet for finished game', async () => {
        await renderGamesPage()
        expect(screen.getByText(/game\.editResult/)).toBeInTheDocument()
        fireEvent.click(screen.getByText(/game\.editResult/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('GamesPage — edit game sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('opens edit sheet for open game when pencil button clicked', async () => {
        await renderGamesPage()
        // Open game (Warmup) has an edit button (✏️ button that is not btn-secondary)
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('action.edit')
        })
    })

    it('shows game name input pre-filled in edit sheet', async () => {
        await renderGamesPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            const input = screen.getByDisplayValue('Warmup')
            expect(input).toBeInTheDocument()
        })
    })

    it('calls api.updateGame on edit sheet submit', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateGame).mockResolvedValueOnce({} as any)
        await renderGamesPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => screen.getByDisplayValue('Warmup'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateGame).toHaveBeenCalled()
        })
    })
})

describe('GamesPage — delete game', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('shows delete confirm buttons after clicking delete', async () => {
        await renderGamesPage()
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(screen.getByText('✓')).toBeInTheDocument()
        })
    })

    it('calls api.deleteGame when confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteGame).mockResolvedValueOnce(undefined as any)
        await renderGamesPage()
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => screen.getByText('✓'))
        fireEvent.click(screen.getByText('✓'))
        await waitFor(() => {
            expect(api.deleteGame).toHaveBeenCalledWith(42, expect.any(Number))
        })
    })
})

describe('GamesPage — start game', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
    })

    it('calls api.startGame when start button clicked', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        // No running game — so start directly
        const eveningNoRunning = { ...ACTIVE_EVENING, games: [OPEN_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningNoRunning as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.startGame).mockResolvedValueOnce({} as any)
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.start/))
        await waitFor(() => {
            expect(api.startGame).toHaveBeenCalledWith(42, OPEN_GAME.id)
        })
    })

    it('shows confirm sheet when trying to start while another game is running', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        // Both open and running games
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.start/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('GamesPage — unassigned players warning', () => {
    it('shows warning when teams exist but players are unassigned', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithTeams = {
            ...ACTIVE_EVENING,
            teams: [{ id: 1, name: 'Team A' }],
            players: [
                { ...PLAYERS[0], team_id: null },
                { ...PLAYERS[1], team_id: null },
            ],
        }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningWithTeams as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        expect(screen.getByText(/team\.playersUnassigned/)).toBeInTheDocument()
    })
})

describe('GamesPage — finished game display', () => {
    it('shows winner name for finished game', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const finishedWithWinner = {
            ...FINISHED_GAME,
            winner_ref: 'p:1',
            winner_name: 'Hans',
        }
        const eveningWithFinished = { ...ACTIVE_EVENING, games: [finishedWithWinner] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningWithFinished as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        // winner_ref p:1 → looks up player 1 = Hans
        expect(screen.getByText(/Hans/)).toBeInTheDocument()
    })

    it('shows game status open text', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningOnlyOpen = { ...ACTIVE_EVENING, games: [OPEN_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningOnlyOpen as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        expect(screen.getByText(/game\.status\.open/)).toBeInTheDocument()
    })
})

// ── additional coverage tests ──────────────────────────────────────────────────

describe('GamesPage — opener game flag', () => {
    it('shows king crown for opener game', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const openerGame = { ...OPEN_GAME, id: 10, name: 'Eröffnungsspiel', is_opener: true }
        const eveningWithOpener = { ...ACTIVE_EVENING, games: [openerGame] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningWithOpener as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        // opener games show 👑 prefix
        expect(screen.getByText(/Eröffnungsspiel/)).toBeInTheDocument()
    })
})

describe('GamesPage — scores display', () => {
    it('shows winner name for finished game', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const gameWithWinner = {
            ...FINISHED_GAME,
            winner_ref: 'p:1',
        }
        const eveningWithWinner = { ...ACTIVE_EVENING, games: [gameWithWinner] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningWithWinner as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        // winner name appears in finished game card via winnerDisplayName
        expect(screen.getByText(/Hans/)).toBeInTheDocument()
    })
})

describe('GamesPage — delete game', () => {
    it('shows delete button for open game', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningOnlyOpen = { ...ACTIVE_EVENING, games: [OPEN_GAME] }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: eveningOnlyOpen as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        expect(screen.getAllByText('✕').length).toBeGreaterThan(0)
    })
})

describe('GamesPage — closed evening', () => {
    it('still shows add game button for closed evening', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const closedEvening = { ...ACTIVE_EVENING, is_closed: true }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: closedEvening as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        // GamesPage always shows the add button regardless of is_closed
        expect(screen.getByText(/game\.add/)).toBeInTheDocument()
    })

    it('shows games in closed evening', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const closedEvening = { ...ACTIVE_EVENING, is_closed: true }
        vi.mocked(useActiveEvening).mockReturnValue({ evening: closedEvening as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
        await renderGamesPage()
        expect(screen.getByText('Warmup')).toBeInTheDocument()
    })
})

describe('GamesPage — edit game update', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: [], regularMembers: [] }))
    })

    it('calls api.updateGame when edit sheet submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateGame).mockResolvedValueOnce({} as any)
        await renderGamesPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateGame).toHaveBeenCalled()
        })
    })

    it('shows per-point penalty input in edit sheet', async () => {
        await renderGamesPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            expect(screen.getByText('game.perPointPenalty')).toBeInTheDocument()
        })
    })
})

describe('GamesPage — add game with template', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: ACTIVE_EVENING as any, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        const templates = [
            { id: 1, name: 'Eröffnung', is_opener: true, loser_penalty: 2.00, winner_type: 'individual', turn_mode: 'alternating', per_point_penalty: 0, sort_order: 1 },
        ]
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, gameTemplates: templates, regularMembers: [] }))
    })

    it('selects template and populates name field', async () => {
        await renderGamesPage()
        fireEvent.click(screen.getByText(/game\.add/))
        // Template chip renders as '👑 Eröffnung' because is_opener: true
        await waitFor(() => screen.getByText(/Eröffnung/))
        // Click the template chip
        fireEvent.click(screen.getByText(/Eröffnung/))
        await waitFor(() => {
            const nameInput = screen.getByPlaceholderText('game.name')
            expect((nameInput as HTMLInputElement).value).toBe('Eröffnung')
        })
    })
})
