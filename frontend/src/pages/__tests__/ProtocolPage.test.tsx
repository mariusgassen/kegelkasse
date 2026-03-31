import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
            setPenaltyTypes: vi.fn(),
            regularMembers: [],
            guestPenaltyCap: null,
        }
        return sel ? sel(store) : store
    }),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        listPins: vi.fn(),
        addPenalty: vi.fn(),
        deletePenalty: vi.fn(),
        updatePenalty: vi.fn(),
        createPenaltyType: vi.fn(),
        addDrinkRound: vi.fn(),
        deleteDrinkRound: vi.fn(),
        calculateAbsencePenalties: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/utils/parse.ts', () => ({ parseAmount: (s: string) => parseFloat(s) || 0 }))
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
vi.mock('@/components/ui/Empty.tsx', () => ({
    Empty: ({ text }: any) => <div>{text}</div>,
}))
vi.mock('@/components/ui/ChipSelect.tsx', () => ({
    ChipSelect: ({ options, onChange, selected }: any) => (
        <div>
            {options?.map((o: any) => {
                const id = o.id ?? o.value
                const isSelected = Array.isArray(selected) ? selected.includes(id) : selected === id
                return (
                    <button
                        key={id}
                        data-selected={isSelected}
                        onClick={() => {
                            const newSelected = Array.isArray(selected)
                                ? (isSelected ? selected.filter((s: any) => s !== id) : [...selected, id])
                                : [id]
                            onChange(newSelected)
                        }}
                    >
                        {o.label}
                    </button>
                )
            })}
        </div>
    ),
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
vi.mock('@/components/ui/EmojiPickerButton.tsx', () => ({
    EmojiPickerButton: ({ value, onChange }: any) => (
        <button onClick={() => onChange('🎯')}>{value}</button>
    ),
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
    { id: 10, user_id: 1, regular_member_id: 1, display_name: 'Admin', name: 'Admin', is_king: false, team_id: null },
    { id: 11, user_id: 2, regular_member_id: 2, display_name: 'Hansi', name: 'Hansi', is_king: false, team_id: null },
]

const PENALTY_LOG = [
    {
        id: 101, player_id: 10, player_name: 'Admin', penalty_type_name: 'Bier',
        icon: '🍺', amount: 3, mode: 'count', unit_amount: 1.00,
        game_id: null, note: null, client_timestamp: Date.now() - 60000, created_at: new Date().toISOString(),
    },
    {
        id: 102, player_id: 11, player_name: 'Hansi', penalty_type_name: 'Strafe',
        icon: '⚠️', amount: 0.50, mode: 'euro', unit_amount: null,
        game_id: null, note: null, client_timestamp: Date.now() - 30000, created_at: new Date().toISOString(),
    },
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

async function renderProtocolPage(props: Record<string, any> = {}) {
    const { ProtocolPage } = await import('../ProtocolPage')
    return render(<ProtocolPage {...props} />, { wrapper: makeWrapper() })
}

async function setupDefaultMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.listPins).mockResolvedValue([])
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ProtocolPage — no active evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: null, invalidate: vi.fn() } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: [], setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows protocol heading', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/evening\.tab\.log/)).toBeInTheDocument()
    })

    it('shows no-active evening empty state', async () => {
        await renderProtocolPage()
        expect(screen.getByText('evening.noActive')).toBeInTheDocument()
    })
})

describe('ProtocolPage — with active evening, no penalties', () => {
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows penalty total row', async () => {
        await renderProtocolPage()
        expect(screen.getByText('penalty.total')).toBeInTheDocument()
    })

    it('shows add penalty button', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/\+ Strafe/)).toBeInTheDocument()
    })

    it('shows add drink button', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/\+ Getränk/)).toBeInTheDocument()
    })

    it('shows player filter chips when players present', async () => {
        await renderProtocolPage()
        // Players list rendered as filter chips
        expect(screen.getByText('Admin')).toBeInTheDocument()
        expect(screen.getByText('Hansi')).toBeInTheDocument()
    })
})

describe('ProtocolPage — with penalty log entries', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithLog = { ...ACTIVE_EVENING, penalty_log: PENALTY_LOG }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithLog as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows penalty entry with player name', async () => {
        await renderProtocolPage()
        expect(screen.getByText('Bier')).toBeInTheDocument()
    })

    it('shows penalty type icons', async () => {
        await renderProtocolPage()
        expect(screen.getAllByText(/🍺/).length).toBeGreaterThan(0)
    })

    it('shows player names in log', async () => {
        await renderProtocolPage()
        // Player names appear in penalty entries
        expect(screen.getAllByText('Admin').length).toBeGreaterThan(0)
    })
})

describe('ProtocolPage — admin features', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows absence penalty calculate button for admin', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/penalty\.absence\.calculate/)).toBeInTheDocument()
    })
})

describe('ProtocolPage — quick entry button', () => {
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
            const store = { user: null, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows quick entry button when onQuickEntry prop provided', async () => {
        await renderProtocolPage({ onQuickEntry: vi.fn() })
        expect(screen.getByText(/quickEntry\.open/)).toBeInTheDocument()
    })

    it('does not show quick entry button when prop not provided', async () => {
        await renderProtocolPage()
        expect(screen.queryByText(/quickEntry\.open/)).not.toBeInTheDocument()
    })
})

describe('ProtocolPage — drink rounds', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithDrinks = {
            ...ACTIVE_EVENING,
            drink_rounds: [
                {
                    id: 201, drink_type: 'beer', variety: 'Pils',
                    participant_ids: [10, 11],
                    client_timestamp: Date.now() - 60000,
                    created_at: new Date().toISOString(),
                },
            ],
        }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithDrinks as any,
            invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: [], setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows drink variety name', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/Pils/)).toBeInTheDocument()
    })
})

describe('ProtocolPage — penalty sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('opens penalty sheet when + Strafe button clicked', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Strafe/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows penalty types in sheet', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Strafe/))
        await waitFor(() => {
            expect(screen.getByText(/Bier/)).toBeInTheDocument()
        })
    })

    it('shows quick and custom tabs in sheet', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Strafe/))
        await waitFor(() => {
            expect(screen.getByText('penalty.quick')).toBeInTheDocument()
            expect(screen.getByText('penalty.custom')).toBeInTheDocument()
        })
    })

    it('submit button is disabled when no player selected', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Strafe/))
        await waitFor(() => screen.getByTestId('sheet'))
        // penalty.confirm button should be disabled (playerIds=[])
        const confirmBtn = screen.getByText('penalty.confirm')
        expect(confirmBtn).toBeDisabled()
    })

    it('shows player options in sheet for players', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Strafe/))
        await waitFor(() => {
            // ChipSelect renders options as buttons
            expect(screen.getAllByText('Admin').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Hansi').length).toBeGreaterThan(0)
        })
    })
})

describe('ProtocolPage — drink sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('opens drink sheet when + Getränk button clicked', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Getränk/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows drink types in drink sheet', async () => {
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Getränk/))
        await waitFor(() => {
            expect(screen.getByText(/drinks\.beer/)).toBeInTheDocument()
        })
    })

    it('calls api.addDrinkRound on drink sheet submit', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addDrinkRound).mockResolvedValueOnce({} as any)
        await renderProtocolPage()
        fireEvent.click(screen.getByText(/\+ Getränk/))
        // drink sheet uses action.done button (no onSubmit on Sheet)
        await waitFor(() => screen.getByText('action.done'))
        fireEvent.click(screen.getByText('action.done'))
        await waitFor(() => {
            expect(api.addDrinkRound).toHaveBeenCalled()
        })
    })
})

describe('ProtocolPage — penalty log interactions', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithLog = { ...ACTIVE_EVENING, penalty_log: PENALTY_LOG }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithLog as any, invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: ADMIN_USER, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows edit button for each penalty entry', async () => {
        await renderProtocolPage()
        expect(screen.getAllByText('✏️').length).toBeGreaterThan(0)
    })

    it('shows delete button for each penalty entry', async () => {
        await renderProtocolPage()
        expect(screen.getAllByText('✕').length).toBeGreaterThan(0)
    })

    it('shows delete confirmation when ✕ clicked', async () => {
        await renderProtocolPage()
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(screen.getByText('✓')).toBeInTheDocument()
        })
    })

    it('calls api.deletePenalty when deletion confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deletePenalty).mockResolvedValueOnce(undefined as any)
        await renderProtocolPage()
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => screen.getByText('✓'))
        fireEvent.click(screen.getByText('✓'))
        await waitFor(() => {
            expect(api.deletePenalty).toHaveBeenCalled()
        })
    })

    it('opens edit sheet when ✏️ clicked on penalty entry', async () => {
        await renderProtocolPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('ProtocolPage — player filter', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithLog = { ...ACTIVE_EVENING, penalty_log: PENALTY_LOG }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithLog as any, invalidate: vi.fn(),
        } as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, penaltyTypes: PENALTY_TYPES, setPenaltyTypes: vi.fn(), regularMembers: [], guestPenaltyCap: null }
            return sel ? sel(store) : store
        })
        await setupDefaultMocks()
    })

    it('shows player chips for filtering (action.all + player names)', async () => {
        await renderProtocolPage()
        expect(screen.getByText('action.all')).toBeInTheDocument()
    })

    it('shows penalty count in nav.penalties heading', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/nav\.penalties/)).toBeInTheDocument()
    })

    it('shows drinks section heading', async () => {
        await renderProtocolPage()
        expect(screen.getByText(/drinks\.title/)).toBeInTheDocument()
    })
})
