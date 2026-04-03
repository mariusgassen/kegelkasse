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
        activeEveningId: null,
        isPending: false,
    })),
}))

vi.mock('@/hooks/useOnline.ts', () => ({
    useOnline: vi.fn(() => true),
}))

// EveningPage calls useAppStore() without selector
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn(() => ({
        user: null,
        regularMembers: [],
        setActiveEveningId: vi.fn(),
    })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getClub: vi.fn(),
        createEvening: vi.fn(),
        updateEvening: vi.fn(),
        getEvening: vi.fn(),
        listPins: vi.fn(),
        addPlayer: vi.fn(),
        removePlayer: vi.fn(),
        updatePlayer: vi.fn(),
        createRegularMember: vi.fn(),
        listRegularMembers: vi.fn(),
        createTeam: vi.fn(),
        updateTeam: vi.fn(),
        deleteTeam: vi.fn(),
        applyClubTeamsToEvening: vi.fn(),
        addHighlight: vi.fn(),
        deleteHighlight: vi.fn(),
        addPenalty: vi.fn(),
        markCancelled: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({
    toastError: vi.fn(),
    handleAlreadyActive: vi.fn(),
}))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))
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
    ChipSelect: ({ options, onChange }: any) => (
        <div>
            {options?.map((o: any) => (
                <button key={o.id ?? o.value} onClick={() => onChange(o.id ?? o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    ),
}))
vi.mock('@/components/ui/CommentThread.tsx', () => ({
    CommentThread: () => null,
}))
vi.mock('@/components/ui/MediaUploadButton.tsx', () => ({
    MediaUploadButton: () => null,
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_USER = {
    id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin',
    username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const MEMBER_USER = {
    id: 2, role: 'member', email: 'member@test.de', name: 'Hans',
    username: 'hans', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 2,
}

const REGULAR_MEMBERS = [
    { id: 1, name: 'Admin', nickname: null, is_guest: false, is_active: true, is_committee: false, avatar: null },
    { id: 2, name: 'Hans', nickname: 'Hansi', is_guest: false, is_active: true, is_committee: false, avatar: null },
]

const PLAYERS = [
    { id: 10, user_id: 1, regular_member_id: 1, display_name: 'Admin', name: 'Admin', is_king: false, team_id: null, is_present: true },
    { id: 11, user_id: 2, regular_member_id: 2, display_name: 'Hansi', name: 'Hansi', is_king: false, team_id: null, is_present: true },
]

const ACTIVE_EVENING = {
    id: 42,
    date: '2026-01-10T00:00:00',
    venue: 'Stammtisch',
    note: 'Testabend',
    is_closed: false,
    is_deleted: false,
    created_by: 1,
    players: PLAYERS,
    teams: [],
    games: [],
    highlights: [],
    player_count: 2,
    game_count: 0,
}

const CLOSED_EVENING = {
    ...ACTIVE_EVENING,
    is_closed: true,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderEveningPage() {
    const { EveningPage } = await import('../EveningPage')
    return render(<EveningPage />, { wrapper: makeWrapper() })
}

async function setupDefaultApiMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.listPins).mockResolvedValue([])
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('EveningPage — no active evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: null, invalidate: vi.fn(), activeEveningId: null, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows evening heading', async () => {
        await renderEveningPage()
        expect(screen.getByText(/nav\.evening/)).toBeInTheDocument()
    })

    it('shows start evening form', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.start')).toBeInTheDocument()
    })

    it('shows date label', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.date')).toBeInTheDocument()
    })

    it('shows venue label', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.venue')).toBeInTheDocument()
    })

    it('shows start action button', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.startButton')).toBeInTheDocument()
    })
})

describe('EveningPage — with active evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows evening heading', async () => {
        await renderEveningPage()
        expect(screen.getByText(/nav\.evening/)).toBeInTheDocument()
    })

    it('shows active badge', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.active')).toBeInTheDocument()
    })

    it('shows venue in evening info card', async () => {
        await renderEveningPage()
        expect(screen.getByText(/Stammtisch/)).toBeInTheDocument()
    })

    it('shows end evening button', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.end')).toBeInTheDocument()
    })

    it('shows player names in list', async () => {
        await renderEveningPage()
        expect(screen.getByText('Admin')).toBeInTheDocument()
        expect(screen.getByText('Hansi')).toBeInTheDocument()
    })

    it('shows add player button', async () => {
        await renderEveningPage()
        expect(screen.getByText(/player\.add/)).toBeInTheDocument()
    })

    it('shows Ich badge for current user', async () => {
        await renderEveningPage()
        // ADMIN_USER has regular_member_id: 1, player Admin has regular_member_id: 1
        expect(screen.getByText('Ich')).toBeInTheDocument()
    })
})

describe('EveningPage — closed evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: CLOSED_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows reopen button for closed evening', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.reopen')).toBeInTheDocument()
    })

    it('does not show active badge for closed evening', async () => {
        await renderEveningPage()
        expect(screen.queryByText('evening.active')).not.toBeInTheDocument()
    })
})

describe('EveningPage — highlights section', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithHighlights = {
            ...ACTIVE_EVENING,
            highlights: [
                { id: 1, text: 'Awesome strike!', media_url: null, created_by: 1, created_by_name: 'Admin', created_at: '2026-01-10T20:00:00', reactions: [], comment_count: 0 },
            ],
        }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithHighlights as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows highlight text', async () => {
        await renderEveningPage()
        expect(screen.getByText('Awesome strike!')).toBeInTheDocument()
    })

    it('shows highlights section heading', async () => {
        await renderEveningPage()
        expect(screen.getByText(/highlight\.title/)).toBeInTheDocument()
    })
})

describe('EveningPage — member user view', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: MEMBER_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows Ich badge for member user (Hansi, member_id=2)', async () => {
        await renderEveningPage()
        // MEMBER_USER has regular_member_id: 2, player Hansi has regular_member_id: 2
        expect(screen.getByText('Ich')).toBeInTheDocument()
    })

    it('shows players list', async () => {
        await renderEveningPage()
        expect(screen.getByText('Admin')).toBeInTheDocument()
        expect(screen.getByText('Hansi')).toBeInTheDocument()
    })
})

describe('EveningPage — pending sync banner', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: true,  // pending sync
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows pending sync banner when isPending=true', async () => {
        await renderEveningPage()
        expect(screen.getByText('sync.pendingEvening')).toBeInTheDocument()
    })
})

describe('EveningPage — edit evening sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('opens edit sheet when pencil button clicked', async () => {
        await renderEveningPage()
        // First ✏️ is the evening edit button (player edit buttons come after)
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows edit sheet title', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('evening.edit')
        })
    })

    it('calls api.updateEvening on submit', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateEvening).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateEvening).toHaveBeenCalled()
        })
    })
})

describe('EveningPage — close evening flow', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows end confirm prompt when end button clicked', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.end'))
        await waitFor(() => {
            expect(screen.getByText('evening.endConfirm')).toBeInTheDocument()
        })
    })

    it('shows cancel button in end confirm', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.end'))
        await waitFor(() => {
            expect(screen.getByText('action.cancel')).toBeInTheDocument()
        })
    })

    it('hides confirm when cancel clicked', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.end'))
        await waitFor(() => screen.getByText('action.cancel'))
        fireEvent.click(screen.getByText('action.cancel'))
        await waitFor(() => {
            expect(screen.queryByText('evening.endConfirm')).not.toBeInTheDocument()
        })
    })

    it('calls api.updateEvening to close when confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateEvening).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.end'))
        await waitFor(() => screen.getByText('action.done'))
        fireEvent.click(screen.getByText('action.done'))
        await waitFor(() => {
            expect(api.updateEvening).toHaveBeenCalledWith(42, { is_closed: true })
        })
    })
})

describe('EveningPage — player management', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows player count in section header', async () => {
        await renderEveningPage()
        expect(screen.getByText(/team\.members/)).toBeInTheDocument()
    })

    it('shows teams section', async () => {
        await renderEveningPage()
        expect(screen.getByText(/Teams/)).toBeInTheDocument()
    })

    it('opens player add sheet when + player.add clicked', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows add player sheet with member names', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('player.add')
        })
    })

    it('shows player removal confirmation when ✕ clicked', async () => {
        await renderEveningPage()
        // There are multiple ✕ buttons (one per player); click first one
        const removeBtns = screen.getAllByText('✕')
        fireEvent.click(removeBtns[0])
        await waitFor(() => {
            expect(screen.getByText(/player\.removeWarning/)).toBeInTheDocument()
        })
    })

    it('calls api.removePlayer when removal confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.removePlayer).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        const removeBtns = screen.getAllByText('✕')
        fireEvent.click(removeBtns[0])
        await waitFor(() => screen.getByText(/player\.removeWarning/))
        fireEvent.click(screen.getByText('✓'))
        await waitFor(() => {
            expect(api.removePlayer).toHaveBeenCalledWith(42, expect.any(Number))
        })
    })

    it('shows team empty state when no teams', async () => {
        await renderEveningPage()
        expect(screen.getByText('club.teams.none')).toBeInTheDocument()
    })

    it('shows add team button', async () => {
        await renderEveningPage()
        // + button for adding team
        const plusBtns = screen.getAllByText('+')
        expect(plusBtns.length).toBeGreaterThan(0)
    })
})

describe('EveningPage — team management', () => {
    const ACTIVE_EVENING_WITH_TEAMS = {
        ...ACTIVE_EVENING,
        teams: [
            { id: 1, name: 'Team Alpha' },
            { id: 2, name: 'Team Beta' },
        ],
        players: [
            { ...PLAYERS[0], team_id: 1 },
            { ...PLAYERS[1], team_id: 2 },
        ],
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING_WITH_TEAMS as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows team names when teams exist', async () => {
        await renderEveningPage()
        expect(screen.getAllByText('Team Alpha').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Team Beta').length).toBeGreaterThan(0)
    })

    it('shows player team assignment in player row', async () => {
        await renderEveningPage()
        expect(screen.getAllByText('Team Alpha').length).toBeGreaterThan(0)
    })

    it('shows new team sheet when + button clicked', async () => {
        await renderEveningPage()
        // First + button is team add button (second is highlight submit)
        const plusBtns = screen.getAllByText('+')
        fireEvent.click(plusBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('EveningPage — note display', () => {
    it('shows evening note when present', async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
        await renderEveningPage()
        // ACTIVE_EVENING has note: 'Testabend'
        expect(screen.getByText('Testabend')).toBeInTheDocument()
    })
})

describe('EveningPage — start evening form interaction', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: null, invalidate: vi.fn(), activeEveningId: null, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('calls api.createEvening on form submit', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createEvening).mockResolvedValueOnce({ id: 99 } as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.startButton'))
        await waitFor(() => {
            expect(api.createEvening).toHaveBeenCalled()
        })
    })

    it('shows UnplannedAttendanceSheet after evening created', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createEvening).mockResolvedValueOnce({ id: 99 } as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.startButton'))
        await waitFor(() => {
            // After creating evening, UnplannedAttendanceSheet renders as a sheet
            expect(screen.getByText('evening.attendance')).toBeInTheDocument()
        })
    })

    it('shows venue input', async () => {
        await renderEveningPage()
        expect(screen.getByPlaceholderText('evening.venuePlaceholder')).toBeInTheDocument()
    })

    it('updates venue when typed', async () => {
        await renderEveningPage()
        const venueInput = screen.getByPlaceholderText('evening.venuePlaceholder')
        fireEvent.change(venueInput, { target: { value: 'New Venue' } })
        expect(venueInput).toHaveValue('New Venue')
    })
})

describe('EveningPage — add player sheet content', () => {
    const EXTRA_MEMBER = {
        id: 3, name: 'Klaus', nickname: 'Klauschen', is_guest: false, is_active: true, is_committee: false, avatar: null,
    }
    const EXTENDED_MEMBERS = [...REGULAR_MEMBERS, EXTRA_MEMBER]

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: EXTENDED_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows available members in add player sheet', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            // Klaus (nickname Klauschen) is not yet a player
            expect(screen.getByText('Klauschen')).toBeInTheDocument()
        })
    })

    it('shows warning when no teams exist in add player sheet', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getByText(/player\.noTeamsYet/)).toBeInTheDocument()
        })
    })

    it('shows new guest input in add player sheet', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getByPlaceholderText('player.guestPlaceholder')).toBeInTheDocument()
        })
    })

    it('shows member.title section heading in add player sheet', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getByText('member.title')).toBeInTheDocument()
        })
    })
})

describe('EveningPage — UnplannedAttendanceSheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    async function renderAttendanceSheet() {
        const { UnplannedAttendanceSheet } = await import('../EveningPage')
        const onDone = vi.fn()
        const onCancel = vi.fn()
        return render(
            <UnplannedAttendanceSheet eveningId={42} onDone={onDone} onCancel={onCancel} />,
            { wrapper: makeWrapper() },
        )
    }

    it('shows attendance sheet title', async () => {
        await renderAttendanceSheet()
        expect(screen.getByText('evening.attendance')).toBeInTheDocument()
    })

    it('shows member names', async () => {
        await renderAttendanceSheet()
        // REGULAR_MEMBERS: Admin, Hansi (nickname for Hans)
        expect(screen.getAllByText(/Admin|Hansi/).length).toBeGreaterThan(0)
    })

    it('shows start button (evening.startButton)', async () => {
        await renderAttendanceSheet()
        expect(screen.getAllByText('evening.startButton').length).toBeGreaterThan(0)
    })

    it('shows cancel button', async () => {
        await renderAttendanceSheet()
        expect(screen.getAllByText('action.cancel').length).toBeGreaterThan(0)
    })

    it('calls api.addPlayer when start button clicked with checked members', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addPlayer).mockResolvedValue({} as any)
        await renderAttendanceSheet()
        // evening.startButton is the "continue" action
        const startBtns = screen.getAllByText('evening.startButton')
        fireEvent.click(startBtns[startBtns.length - 1]) // last one is in the sheet
        await waitFor(() => {
            expect(api.addPlayer).toHaveBeenCalled()
        })
    })
})

describe('EveningPage — edit player sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('opens edit player sheet when player pencil clicked', async () => {
        await renderEveningPage()
        // Edit buttons: first is evening edit, rest are per player
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[1]) // first player edit
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows player edit sheet title', async () => {
        await renderEveningPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[1])
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('player.edit')
        })
    })

    it('calls api.updatePlayer when edit sheet submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updatePlayer).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[1])
        await waitFor(() => screen.getByText('submit-sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updatePlayer).toHaveBeenCalled()
        })
    })
})

describe('EveningPage — reopen closed evening', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: CLOSED_EVENING as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('calls api.updateEvening to reopen', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateEvening).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('evening.reopen'))
        await waitFor(() => {
            expect(api.updateEvening).toHaveBeenCalledWith(42, { is_closed: false })
        })
    })
})

describe('EveningPage — highlight interaction', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningWithHighlights = {
            ...ACTIVE_EVENING,
            highlights: [
                { id: 1, text: 'Great game!', media_url: null, created_by: 1, created_by_name: 'Admin',
                  created_at: '2026-01-10T20:00:00', reactions: [], comment_count: 0 },
            ],
        }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningWithHighlights as any, invalidate: vi.fn(), activeEveningId: 42, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows delete highlight button', async () => {
        await renderEveningPage()
        // Highlights section has delete buttons
        expect(screen.getAllByText('✕').length).toBeGreaterThan(0)
    })

    it('calls api.deleteHighlight when delete clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteHighlight).mockResolvedValueOnce(undefined as any)
        await renderEveningPage()
        const deleteBtns = screen.getAllByText('✕')
        // Highlight delete is the last ✕ (player removes come first)
        fireEvent.click(deleteBtns[deleteBtns.length - 1])
        await waitFor(() => {
            expect(api.deleteHighlight).toHaveBeenCalledWith(42, 1)
        })
    })

    it('shows highlight submit input', async () => {
        await renderEveningPage()
        expect(screen.getByPlaceholderText('highlight.placeholder')).toBeInTheDocument()
    })
})

// ── Additional coverage tests ──────────────────────────────────────────────────

const PLAYERS_WITH_TEAMS = [
    { id: 10, user_id: 1, regular_member_id: 1, display_name: 'Admin', name: 'Admin', is_king: false, team_id: 1, is_present: true },
    { id: 11, user_id: 2, regular_member_id: 2, display_name: 'Hansi', name: 'Hansi', is_king: false, team_id: 2, is_present: true },
]

const EVENING_WITH_TEAMS = {
    ...ACTIVE_EVENING,
    teams: [
        { id: 1, name: 'Rote Brüder', player_ids: [10] },
        { id: 2, name: 'Blaue Wölfe', player_ids: [11] },
    ],
    players: PLAYERS_WITH_TEAMS,
}

describe('EveningPage — team CRUD', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: EVENING_WITH_TEAMS as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows team names in team list', async () => {
        await renderEveningPage()
        expect(screen.getAllByText('Rote Brüder').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Blaue Wölfe').length).toBeGreaterThan(0)
    })

    it('shows player team assignment in player row', async () => {
        await renderEveningPage()
        expect(screen.getAllByText('Rote Brüder').length).toBeGreaterThan(0)
    })

    it('calls api.deleteTeam when team ✕ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteTeam).mockResolvedValueOnce(undefined as any)
        await renderEveningPage()
        // ✕ buttons: player remove (×2) + team delete (×2)
        const xBtns = screen.getAllByText('✕')
        fireEvent.click(xBtns[0])
        await waitFor(() => {
            expect(api.deleteTeam).toHaveBeenCalled()
        })
    })

    it('opens new team sheet when + button clicked', async () => {
        await renderEveningPage()
        // + button in teams section
        const plusBtns = screen.getAllByText('+')
        fireEvent.click(plusBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('opens edit team sheet when team ✏️ clicked', async () => {
        await renderEveningPage()
        // First ✏️ is evening edit, then team edits
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[1]) // first team edit
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('team.edit')
        })
    })

    it('calls api.updateTeam when team edit submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateTeam).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[1])
        await waitFor(() => screen.getByText('submit-sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateTeam).toHaveBeenCalled()
        })
    })

    it('calls api.createTeam when new team submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createTeam).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        const plusBtns = screen.getAllByText('+')
        fireEvent.click(plusBtns[0])
        await waitFor(() => screen.getByTestId('sheet'))
        // Type a team name
        const nameInput = screen.getByPlaceholderText('team.namePlaceholder')
        fireEvent.change(nameInput, { target: { value: 'New Team' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createTeam).toHaveBeenCalledWith(42, expect.objectContaining({ name: 'New Team' }))
        })
    })
})

describe('EveningPage — apply/randomize teams buttons', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        // No teams — so apply/randomize buttons should appear
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, teams: [] } as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows apply templates badge button when no teams', async () => {
        await renderEveningPage()
        expect(screen.getByText('team.fromTemplateBadge')).toBeInTheDocument()
    })

    it('shows randomize (dice) button when no teams', async () => {
        await renderEveningPage()
        expect(screen.getByText('🎲')).toBeInTheDocument()
    })

    it('calls api.applyClubTeamsToEvening(id, false) on apply templates', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.applyClubTeamsToEvening).mockResolvedValueOnce(undefined as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('team.fromTemplateBadge'))
        await waitFor(() => {
            expect(api.applyClubTeamsToEvening).toHaveBeenCalledWith(42, false)
        })
    })

    it('shows toast on randomize when no players', async () => {
        const { showToast } = await import('@/components/ui/Toast.tsx')
        const { api } = await import('@/api/client.ts')
        // Evening with 0 players
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, teams: [], players: [] } as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('🎲'))
        await waitFor(() => {
            expect(showToast).toHaveBeenCalled()
        })
        expect(api.applyClubTeamsToEvening).not.toHaveBeenCalled()
    })

    it('calls api.applyClubTeamsToEvening(id, true) on randomize with players', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.applyClubTeamsToEvening).mockResolvedValueOnce(undefined as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText('🎲'))
        await waitFor(() => {
            expect(api.applyClubTeamsToEvening).toHaveBeenCalledWith(42, true)
        })
    })
})

describe('EveningPage — add player with team selection', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: EVENING_WITH_TEAMS as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows team selection chips in add player sheet', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getByText('team.label')).toBeInTheDocument()
        })
    })

    it('shows team name buttons in add player sheet', async () => {
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => {
            expect(screen.getAllByText('Rote Brüder').length).toBeGreaterThan(0)
        })
    })

    it('calls api.addPlayer with team_id when member selected and submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addPlayer).mockResolvedValueOnce({} as any)
        // Use a fresh evening with no players but with teams
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: { ...ACTIVE_EVENING, teams: [{ id: 1, name: 'Rote Brüder', player_ids: [] }], players: [] } as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER,
            regularMembers: REGULAR_MEMBERS,
            setActiveEveningId: vi.fn(),
            setRegularMembers: vi.fn(),
        } as any)
        await renderEveningPage()
        fireEvent.click(screen.getByText(/player\.add/))
        await waitFor(() => screen.getByText(/Admin/))
        // Click a member chip
        fireEvent.click(screen.getByText('Admin'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.addPlayer).toHaveBeenCalled()
        })
    })
})

describe('EveningPage — highlight add via button', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('calls api.addHighlight when + button clicked with text', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addHighlight).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        const input = screen.getByPlaceholderText('highlight.placeholder')
        fireEvent.change(input, { target: { value: 'Amazing game' } })
        // Click the + button in the highlight add section (last + on page)
        const plusBtns = screen.getAllByText('+')
        fireEvent.click(plusBtns[plusBtns.length - 1])
        await waitFor(() => {
            expect(api.addHighlight).toHaveBeenCalledWith(42, expect.objectContaining({ text: 'Amazing game' }))
        })
    })

    it('shows king crown icon for king player', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: {
                ...ACTIVE_EVENING,
                players: [
                    { ...PLAYERS[0], is_king: true },
                    { ...PLAYERS[1], is_king: false },
                ],
            } as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        await renderEveningPage()
        expect(screen.getByTitle('König')).toBeInTheDocument()
    })
})

describe('EveningPage — PinsAlert sub-component', () => {
    const PIN_WITH_HOLDER = { id: 5, icon: '📌', name: 'Silbernadel', holder_regular_member_id: 1, holder_name: 'Admin' }

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: {
                ...ACTIVE_EVENING,
                penalty_log: [],
            } as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { pin_penalty: 2.50 } } as any)
        vi.mocked(api.listPins).mockResolvedValue([PIN_WITH_HOLDER] as any)
    })

    it('shows pin alert when holder is a player', async () => {
        await renderEveningPage()
        await waitFor(() => {
            expect(screen.getByText('Silbernadel')).toBeInTheDocument()
        })
    })

    it('shows missing penalty button for pin alert', async () => {
        await renderEveningPage()
        await waitFor(() => {
            expect(screen.getByText(/pin\.missingPenalty/)).toBeInTheDocument()
        })
    })

    it('calls api.addPenalty when missing pin button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.addPenalty).mockResolvedValueOnce({} as any)
        await renderEveningPage()
        await waitFor(() => screen.getByText(/pin\.missingPenalty/))
        const missingBtns = screen.getAllByText(/pin\.missingPenalty/)
        fireEvent.click(missingBtns[0])
        await waitFor(() => {
            expect(api.addPenalty).toHaveBeenCalledWith(42, expect.objectContaining({ player_ids: [10] }))
        })
    })

    it('shows undo button when penalty already logged for pin', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: {
                ...ACTIVE_EVENING,
                penalty_log: [{ id: 99, player_name: 'Admin', penalty_type_name: '📌 Silbernadel missing' }],
            } as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        await renderEveningPage()
        await waitFor(() => {
            // undo button is ↩
            expect(screen.getByText('↩')).toBeInTheDocument()
        })
    })
})

describe('EveningPage — UnplannedAttendanceSheet member interactions', () => {
    const GUESTS = [
        { id: 3, name: 'GastMember', nickname: 'Gasti', is_guest: true, is_active: true, is_committee: false, avatar: null },
    ]

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER,
            regularMembers: [...REGULAR_MEMBERS, ...GUESTS],
            setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    async function renderAttendanceSheet() {
        const { UnplannedAttendanceSheet } = await import('../EveningPage')
        const onDone = vi.fn()
        const onCancel = vi.fn()
        return { ...render(
            <UnplannedAttendanceSheet eveningId={42} onDone={onDone} onCancel={onCancel} />,
            { wrapper: makeWrapper() },
        ), onDone, onCancel }
    }

    it('shows all active members initially checked', async () => {
        await renderAttendanceSheet()
        // ☑ = checked
        const checked = screen.getAllByText('☑')
        expect(checked.length).toBe(2) // 2 active non-guest members
    })

    it('toggles member to unchecked when clicked', async () => {
        await renderAttendanceSheet()
        // Click Admin to uncheck them
        const adminBtn = screen.getByText('Admin').closest('button') as HTMLButtonElement
        fireEvent.click(adminBtn)
        await waitFor(() => {
            // Now has ☐ (unchecked)
            expect(screen.getByText('☐')).toBeInTheDocument()
        })
    })

    it('shows abgesagt button after unchecking member', async () => {
        await renderAttendanceSheet()
        const adminBtn = screen.getByText('Admin').closest('button') as HTMLButtonElement
        fireEvent.click(adminBtn)
        await waitFor(() => {
            expect(screen.getByText('rsvp.absent.short')).toBeInTheDocument()
        })
    })

    it('shows known guests section', async () => {
        await renderAttendanceSheet()
        // guests section header
        await waitFor(() => {
            expect(screen.getByText('Gasti')).toBeInTheDocument()
        })
    })

    it('shows guest name input field', async () => {
        await renderAttendanceSheet()
        expect(screen.getByPlaceholderText('player.guestName')).toBeInTheDocument()
    })

    it('calls api.createRegularMember and addPlayer for new guest name', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createRegularMember).mockResolvedValue({ id: 99, name: 'NewGuest' } as any)
        vi.mocked(api.addPlayer).mockResolvedValue({} as any)
        vi.mocked(api.applyClubTeamsToEvening).mockResolvedValue(undefined as any)
        await renderAttendanceSheet()
        const guestInput = screen.getByPlaceholderText('player.guestName')
        fireEvent.change(guestInput, { target: { value: 'NewGuest' } })
        const startBtns = screen.getAllByText('evening.startButton')
        fireEvent.click(startBtns[startBtns.length - 1])
        await waitFor(() => {
            expect(api.createRegularMember).toHaveBeenCalledWith(expect.objectContaining({ name: 'NewGuest', is_guest: true }))
        })
    })

    it('calls onCancel when cancel button clicked', async () => {
        const { onCancel } = await renderAttendanceSheet()
        const cancelBtns = screen.getAllByText('action.cancel')
        fireEvent.click(cancelBtns[cancelBtns.length - 1])
        expect(onCancel).toHaveBeenCalled()
    })
})

describe('EveningPage — offline state', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: null, invalidate: vi.fn(), activeEveningId: null, isPending: false,
        } as any)
        const { useOnline } = await import('@/hooks/useOnline.ts')
        vi.mocked(useOnline).mockReturnValue(false)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows offline hint on start form when offline', async () => {
        await renderEveningPage()
        expect(screen.getByText(/offline\.startHint/)).toBeInTheDocument()
    })
})

describe('EveningPage — club settings autofill', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: null, invalidate: vi.fn(), activeEveningId: null, isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { home_venue: 'Stammtisch Mitte', default_evening_time: '19:30' } } as any)
        vi.mocked(api.listPins).mockResolvedValue([])
    })

    it('prefills venue from club home_venue setting', async () => {
        await renderEveningPage()
        await waitFor(() => {
            expect(screen.getByDisplayValue('Stammtisch Mitte')).toBeInTheDocument()
        })
    })
})

describe('EveningPage — member user (non-admin) view', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: MEMBER_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows Ich badge for current member user', async () => {
        await renderEveningPage()
        // MEMBER_USER has regular_member_id: 2 → player Hansi
        expect(screen.getByText('Ich')).toBeInTheDocument()
    })

    it('shows evening venue for member user', async () => {
        await renderEveningPage()
        expect(screen.getByText(/Stammtisch/)).toBeInTheDocument()
    })

    it('shows evening end button (not admin-gated in EveningPage)', async () => {
        await renderEveningPage()
        expect(screen.getByText('evening.end')).toBeInTheDocument()
    })
})

describe('EveningPage — confirm remove player cancel', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
            activeEveningId: 42,
            isPending: false,
        } as any)
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, regularMembers: REGULAR_MEMBERS, setActiveEveningId: vi.fn(),
        } as any)
        await setupDefaultApiMocks()
    })

    it('shows cancel (✕) button after remove confirm', async () => {
        await renderEveningPage()
        const xBtns = screen.getAllByText('✕')
        fireEvent.click(xBtns[0]) // click first player remove
        await waitFor(() => {
            // Now shows both ✓ and ✕ for the confirmation
            expect(screen.getAllByText('✕').length).toBeGreaterThan(1)
        })
    })

    it('shows removal warning text after remove confirm', async () => {
        await renderEveningPage()
        const xBtns = screen.getAllByText('✕')
        fireEvent.click(xBtns[0])
        await waitFor(() => {
            expect(screen.getByText(/player\.removeWarning/)).toBeInTheDocument()
        })
    })

    it('calls api.removePlayer when ✓ confirm button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.removePlayer).mockResolvedValueOnce(undefined as any)
        await renderEveningPage()
        // Sort order: current user (Admin, id=1) first, then Hansi
        const xBtns = screen.getAllByText('✕')
        fireEvent.click(xBtns[0])
        await waitFor(() => screen.getByText('✓'))
        fireEvent.click(screen.getByText('✓'))
        await waitFor(() => {
            expect(api.removePlayer).toHaveBeenCalled()
        })
    })
})
