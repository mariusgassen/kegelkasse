import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/usePage.ts', () => ({
    useHashTab: vi.fn(() => ['settings', vi.fn()]),
}))

vi.mock('@/hooks/useOnline.ts', () => ({
    useOnline: vi.fn(() => true),
}))

// useAppStore is called both with selector and without:
// - useAppStore(s => s.user) → selector style
// - useAppStore() → returns { setPenaltyTypes, setRegularMembers, setGameTemplates, setGuestPenaltyCap }
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel?: any) => {
        const store = {
            user: null,
            regularMembers: [],
            setPenaltyTypes: vi.fn(),
            setRegularMembers: vi.fn(),
            setGameTemplates: vi.fn(),
            setGuestPenaltyCap: vi.fn(),
        }
        return sel ? sel(store) : store
    }),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getClub: vi.fn(),
        listPenaltyTypes: vi.fn(),
        listGameTemplates: vi.fn(),
        listRegularMembers: vi.fn(),
        getReminderSettings: vi.fn(),
        updateReminderSettings: vi.fn(),
        triggerReminders: vi.fn(),
        broadcastPush: vi.fn(),
        uploadClubLogo: vi.fn(),
        deleteClubLogo: vi.fn(),
        updateClubSettings: vi.fn(),
        createPenaltyType: vi.fn(),
        updatePenaltyType: vi.fn(),
        deletePenaltyType: vi.fn(),
        createGameTemplate: vi.fn(),
        updateGameTemplate: vi.fn(),
        deleteGameTemplate: vi.fn(),
        listClubTeams: vi.fn(),
        createClubTeam: vi.fn(),
        updateClubTeam: vi.fn(),
        deleteClubTeam: vi.fn(),
        listPins: vi.fn(),
        createPin: vi.fn(),
        updatePin: vi.fn(),
        deletePin: vi.fn(),
        setCommitteeMember: vi.fn(),
        listAllClubs: vi.fn(),
        switchClub: vi.fn(),
        createClub: vi.fn(),
        updateClub: vi.fn(),
        deleteClub: vi.fn(),
        listBackups: vi.fn(),
        createBackup: vi.fn(),
        deleteBackup: vi.fn(),
        downloadBackup: vi.fn(),
    },
    authState: { token: null, setToken: vi.fn() },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
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
// Do NOT mock AdminGuard — let it use the already-mocked @/store/app.ts
vi.mock('@/components/ui/OfflineNotice.tsx', () => ({
    OfflineNotice: () => null,
}))
vi.mock('@/components/ui/EmojiPickerButton.tsx', () => ({
    EmojiPickerButton: ({ value, onChange }: any) => (
        <button onClick={() => onChange('🎯')}>{value}</button>
    ),
}))
vi.mock('../MembersPage', () => ({
    MembersPage: () => <div data-testid="members-page">MembersPage</div>,
}))
vi.mock('@/App.tsx', () => ({
    applyClubTheme: vi.fn(),
    hexToHsl: vi.fn(() => [0, 0, 0]),
    hslToHex: vi.fn(() => '#000000'),
}))
vi.mock('@/utils/share.ts', () => ({ shareOrCopy: vi.fn() }))

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_USER = {
    id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin',
    username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const SUPERADMIN_USER = {
    id: 1, role: 'superadmin', email: 'super@test.de', name: 'Super',
    username: 'super', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const PENALTY_TYPES = [
    { id: 1, icon: '🍺', name: 'Bier', default_amount: 1.00, sort_order: 1 },
    { id: 2, icon: '⚠️', name: 'Strafe', default_amount: 0.50, sort_order: 2 },
]

const GAME_TEMPLATES = [
    { id: 1, name: 'Warmup', winner_type: 'individual', turn_mode: 'alternating', loser_penalty: 2.00, per_point_penalty: 0, is_opener: false, sort_order: 1 },
]

const REGULAR_MEMBERS = [
    { id: 1, name: 'Admin', nickname: null, is_guest: false, is_deleted: false, is_committee: false, is_active: true, avatar: null },
    { id: 2, name: 'Hans', nickname: 'Hansi', is_guest: false, is_deleted: false, is_committee: false, is_active: true, avatar: null },
]

const PINS = [
    { id: 1, name: 'Silbernadel', icon: '🥈', holder_regular_member_id: 1, holder_name: 'Admin', assigned_at: '2024-01-01' },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderClubAdminPage() {
    const { ClubAdminPage } = await import('../ClubAdminPage')
    return render(<ClubAdminPage />, { wrapper: makeWrapper() })
}

async function setupDefaultApiMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.listPenaltyTypes).mockResolvedValue([])
    vi.mocked(api.listGameTemplates).mockResolvedValue([])
    vi.mocked(api.listRegularMembers).mockResolvedValue([])
    vi.mocked(api.getReminderSettings).mockResolvedValue({} as any)
    vi.mocked(api.listClubTeams).mockResolvedValue([])
    vi.mocked(api.listPins).mockResolvedValue([])
    vi.mocked(api.listAllClubs).mockResolvedValue([])
    vi.mocked(api.listBackups).mockResolvedValue({ info: [], config: null } as any)
}

async function setupAsAdmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel?: any) => {
        const store = {
            user: ADMIN_USER,
            regularMembers: REGULAR_MEMBERS,
            setPenaltyTypes: vi.fn(),
            setRegularMembers: vi.fn(),
            setGameTemplates: vi.fn(),
            setGuestPenaltyCap: vi.fn(),
        }
        return sel ? sel(store) : store
    })
}

async function setupAsSuperadmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel?: any) => {
        const store = {
            user: SUPERADMIN_USER,
            regularMembers: REGULAR_MEMBERS,
            setPenaltyTypes: vi.fn(),
            setRegularMembers: vi.fn(),
            setGameTemplates: vi.fn(),
            setGuestPenaltyCap: vi.fn(),
            setUser: vi.fn(),
        }
        return sel ? sel(store) : store
    })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ClubAdminPage — tab navigation', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['settings', vi.fn()] as any)
        await setupDefaultApiMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, regularMembers: [], setPenaltyTypes: vi.fn(), setRegularMembers: vi.fn(), setGameTemplates: vi.fn(), setGuestPenaltyCap: vi.fn() }
            return sel ? sel(store) : store
        })
    })

    it('shows club.title heading', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.title')).toBeInTheDocument()
    })

    it('shows settings tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.settings')).toBeInTheDocument()
    })

    it('shows members tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.members')).toBeInTheDocument()
    })

    it('shows penalties tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.penalties')).toBeInTheDocument()
    })

    it('shows templates tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.templates')).toBeInTheDocument()
    })

    it('shows teams tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.teams')).toBeInTheDocument()
    })

    it('shows pins tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.pins')).toBeInTheDocument()
    })

    it('shows VGA tab button', async () => {
        await renderClubAdminPage()
        expect(screen.getByText(/VGA/)).toBeInTheDocument()
    })

    it('does not show clubs tab for non-superadmin', async () => {
        await renderClubAdminPage()
        expect(screen.queryByText('club.tab.clubs')).not.toBeInTheDocument()
    })

    it('does not show backups tab for non-superadmin', async () => {
        await renderClubAdminPage()
        expect(screen.queryByText('club.tab.backups')).not.toBeInTheDocument()
    })
})

describe('ClubAdminPage — superadmin tabs', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['settings', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsSuperadmin()
    })

    it('shows clubs tab for superadmin', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.clubs')).toBeInTheDocument()
    })

    it('shows backups tab for superadmin', async () => {
        await renderClubAdminPage()
        expect(screen.getByText('club.tab.backups')).toBeInTheDocument()
    })
})

describe('ClubAdminPage — settings tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['settings', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('shows admin lock message for non-admin', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel?: any) => {
            const store = { user: null, regularMembers: [], setPenaltyTypes: vi.fn(), setRegularMembers: vi.fn(), setGameTemplates: vi.fn(), setGuestPenaltyCap: vi.fn() }
            return sel ? sel(store) : store
        })
        await renderClubAdminPage()
        expect(screen.getByText('club.adminOnly')).toBeInTheDocument()
    })

    it('shows club name input for admin', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByDisplayValue('TestClub')).toBeInTheDocument()
        })
    })

    it('shows reminder settings section', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getReminderSettings).mockResolvedValue({
            debt_weekly: { enabled: true, weekday: 1, min_debt: 5 },
            upcoming_evening: { enabled: false, days_before: 5 },
            rsvp_reminder: { enabled: false, days_before: 3 },
            debt_day_of: { enabled: false },
            payment_request_nudge: { enabled: false, days_pending: 3 },
            auto_report: { enabled: false, days_before: 1 },
        } as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('reminders.title')).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — penalties tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['penalties', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('shows penalty type list', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listPenaltyTypes).mockResolvedValue(PENALTY_TYPES as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('Bier')).toBeInTheDocument()
            expect(screen.getByText('Strafe')).toBeInTheDocument()
        })
    })

    it('shows add penalty form with label', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('club.penalty.newLabel')).toBeInTheDocument()
        })
    })

    it('shows add button', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText(/action\.add/)).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — templates tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['templates', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('shows game templates list', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listGameTemplates).mockResolvedValue(GAME_TEMPLATES as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('Warmup')).toBeInTheDocument()
        })
    })

    it('shows add game template button', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText(/club\.template\.add/)).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — teams tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['teams', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('shows teams none empty state when no teams', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listClubTeams).mockResolvedValue([])
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('club.teams.none')).toBeInTheDocument()
        })
    })

    it('shows teams description text', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('club.teams.description')).toBeInTheDocument()
        })
    })

    it('shows add team button', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText(/club\.teams\.add/)).toBeInTheDocument()
        })
    })

    it('shows team list when teams exist', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listClubTeams).mockResolvedValue([
            { id: 1, name: 'Team Alpha', sort_order: 0 },
        ] as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('Team Alpha')).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — penalties CRUD', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['penalties', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listPenaltyTypes).mockResolvedValue(PENALTY_TYPES as any)
    })

    it('calls api.createPenaltyType when form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createPenaltyType).mockResolvedValueOnce({ id: 99, icon: '⚠️', name: 'Test', default_amount: 0.50, sort_order: 99 } as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Bier'))
        // Fill in name input and submit
        const nameInput = screen.getByPlaceholderText('Name')
        fireEvent.change(nameInput, { target: { value: 'Neue Strafe' } })
        const form = document.querySelector('form')!
        fireEvent.submit(form)
        await waitFor(() => {
            expect(api.createPenaltyType).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Neue Strafe' })
            )
        })
    })

    it('calls api.deletePenaltyType when ✕ clicked on penalty type', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deletePenaltyType).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Bier'))
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(api.deletePenaltyType).toHaveBeenCalledWith(1)
        })
    })

    it('opens edit sheet when ✏️ clicked on penalty type', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Bier'))
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
            expect(screen.getByText('club.penalty.editLabel')).toBeInTheDocument()
        })
    })

    it('calls api.updatePenaltyType when edit sheet submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updatePenaltyType).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Bier'))
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updatePenaltyType).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Bier' }))
        })
    })
})

describe('ClubAdminPage — game templates CRUD', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['templates', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listGameTemplates).mockResolvedValue(GAME_TEMPLATES as any)
    })

    it('calls api.deleteGameTemplate when ✕ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteGameTemplate).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Warmup'))
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(api.deleteGameTemplate).toHaveBeenCalledWith(1)
        })
    })

    it('opens add template sheet when + button clicked', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText(/club\.template\.add/))
        fireEvent.click(screen.getByText(/club\.template\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('opens edit template sheet when ✏️ clicked', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Warmup'))
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — teams CRUD', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['teams', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listClubTeams).mockResolvedValue([
            { id: 1, name: 'Team Alpha', sort_order: 0 },
        ] as any)
    })

    it('calls api.deleteClubTeam when ✕ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteClubTeam).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Team Alpha'))
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(api.deleteClubTeam).toHaveBeenCalledWith(1)
        })
    })

    it('opens add team sheet when + button clicked', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText(/club\.teams\.add/))
        fireEvent.click(screen.getByText(/club\.teams\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('calls api.createClubTeam when form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createClubTeam).mockResolvedValueOnce({ id: 99, name: 'New Team', sort_order: 0 } as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText(/club\.teams\.add/))
        fireEvent.click(screen.getByText(/club\.teams\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        const nameInput = screen.getByPlaceholderText('z.B. Team A, Die Adler…')
        fireEvent.change(nameInput, { target: { value: 'New Team' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createClubTeam).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Team' }))
        })
    })
})

describe('ClubAdminPage — pins tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['pins', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('shows pins list when pins exist', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listPins).mockResolvedValue(PINS as any)
        vi.mocked(api.listRegularMembers).mockResolvedValue(REGULAR_MEMBERS as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('Silbernadel')).toBeInTheDocument()
        })
    })

    it('shows add pin button', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText(/pin\.add/)).toBeInTheDocument()
        })
    })

    it('calls api.deletePin when ✕ clicked on pin', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listPins).mockResolvedValue(PINS as any)
        vi.mocked(api.listRegularMembers).mockResolvedValue(REGULAR_MEMBERS as any)
        vi.mocked(api.deletePin).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Silbernadel'))
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(api.deletePin).toHaveBeenCalledWith(1)
        })
    })

    it('opens add pin sheet when + button clicked', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText(/pin\.add/))
        fireEvent.click(screen.getByText(/pin\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — members tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['members', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('renders MembersPage inside members tab', async () => {
        await renderClubAdminPage()
        expect(screen.getByTestId('members-page')).toBeInTheDocument()
    })
})

describe('ClubAdminPage — committee admin tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['committee', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('shows committee members hint text', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRegularMembers).mockResolvedValue(REGULAR_MEMBERS as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('committee.membersHint')).toBeInTheDocument()
        })
    })

    it('shows non-committee members in the list', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRegularMembers).mockResolvedValue(REGULAR_MEMBERS as any)
        await renderClubAdminPage()
        await waitFor(() => {
            // non-committee members shown as candidates (nickname takes priority)
            expect(screen.getAllByText(/Hansi|Hans/).length).toBeGreaterThan(0)
        })
    })
})

describe('ClubAdminPage — backups tab (superadmin)', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['backups', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsSuperadmin()
    })

    it('shows backup.title heading', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('backup.title')).toBeInTheDocument()
        })
    })

    it('shows trigger backup button', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText(/backup\.trigger/)).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — clubs tab (superadmin)', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['clubs', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsSuperadmin()
    })

    it('shows clubs list heading', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAllClubs).mockResolvedValue([
            { id: 1, name: 'TestClub', slug: 'testclub' },
        ] as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('TestClub')).toBeInTheDocument()
        })
    })

    it('shows create club form', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('superadmin.clubs.create')).toBeInTheDocument()
        })
    })
})

// ── Additional coverage tests ──────────────────────────────────────────────────

describe('ClubAdminPage — settings save', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['settings', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
    })

    it('calls api.updateClubSettings when save button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateClubSettings).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByDisplayValue('TestClub'))
        // There may be multiple save buttons (settings + reminder card) — click the first
        const saveBtns = screen.getAllByText('action.save')
        fireEvent.click(saveBtns[0])
        await waitFor(() => {
            expect(api.updateClubSettings).toHaveBeenCalled()
        })
    })

    it('shows broadcast title heading in settings tab', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('broadcast.title')).toBeInTheDocument()
        })
    })

    it('calls api.broadcastPush when send button clicked with title+body', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.broadcastPush).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('broadcast.title'))
        const titleInput = screen.getByPlaceholderText('broadcast.label')
        const bodyInput = screen.getByPlaceholderText('broadcast.body')
        fireEvent.change(titleInput, { target: { value: 'Hello' } })
        fireEvent.change(bodyInput, { target: { value: 'World' } })
        fireEvent.click(screen.getByText('broadcast.send'))
        await waitFor(() => {
            expect(api.broadcastPush).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hello', body: 'World' }))
        })
    })

    it('shows palette suggest button in settings tab', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('club.palette.suggest')).toBeInTheDocument()
        })
    })

    it('shows palette suggestions after clicking suggest', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('club.palette.suggest'))
        fireEvent.click(screen.getByText('club.palette.suggest'))
        await waitFor(() => {
            expect(screen.getByText('club.palette.warm')).toBeInTheDocument()
        })
    })

    it('shows random palette button', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText(/club\.palette\.random/)).toBeInTheDocument()
        })
    })

    it('shows paypal input in settings tab', async () => {
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('club.paypalMe')).toBeInTheDocument()
        })
    })
})

describe('ClubAdminPage — reminder settings interactions', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['settings', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getReminderSettings).mockResolvedValue({
            debt_weekly: { enabled: false, weekday: 1, min_debt: 5 },
            upcoming_evening: { enabled: false, days_before: 5 },
            rsvp_reminder: { enabled: false, days_before: 3 },
            debt_day_of: { enabled: false },
            payment_request_nudge: { enabled: false, days_pending: 3 },
            auto_report: { enabled: false, days_before: 1 },
        } as any)
    })

    it('calls api.updateReminderSettings when reminder save clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateReminderSettings).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => {
            expect(screen.getByText('reminders.title')).toBeInTheDocument()
        }, { timeout: 3000 })
        const saveBtns = screen.getAllByText('action.save')
        // Last save button is in reminders card (after settings save)
        fireEvent.click(saveBtns[saveBtns.length - 1])
        await waitFor(() => {
            expect(api.updateReminderSettings).toHaveBeenCalled()
        })
    })

    it('calls api.triggerReminders when triggerNow button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.triggerReminders).mockResolvedValueOnce(undefined as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('reminders.triggerNow'))
        fireEvent.click(screen.getByText('reminders.triggerNow'))
        await waitFor(() => {
            expect(api.triggerReminders).toHaveBeenCalled()
        })
    })
})

describe('ClubAdminPage — game templates CRUD extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['templates', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listGameTemplates).mockResolvedValue(GAME_TEMPLATES as any)
    })

    it('calls api.createGameTemplate when add template form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createGameTemplate).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Warmup'))
        fireEvent.click(screen.getByText(/club\.template\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // The template name field has no placeholder — find it by being an input inside the sheet
        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const nameInput = inputs.find(i => i.value === '') as HTMLInputElement
        if (nameInput) fireEvent.change(nameInput, { target: { value: 'New Template' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createGameTemplate).toHaveBeenCalled()
        })
    })

    it('calls api.updateGameTemplate when edit template form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateGameTemplate).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Warmup'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateGameTemplate).toHaveBeenCalled()
        })
    })
})

describe('ClubAdminPage — pins CRUD extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['pins', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listPins).mockResolvedValue(PINS as any)
        vi.mocked(api.listRegularMembers).mockResolvedValue(REGULAR_MEMBERS as any)
    })

    it('calls api.createPin when add pin form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createPin).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText(/pin\.add/))
        fireEvent.click(screen.getByText(/pin\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        const nameInput = screen.getByPlaceholderText('z.B. Vereinsnadel')
        fireEvent.change(nameInput, { target: { value: 'Goldnadel' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createPin).toHaveBeenCalled()
        })
    })

    it('opens edit pin sheet when ✏️ clicked', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Silbernadel'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toHaveTextContent(/pin\.edit/)
        })
    })

    it('calls api.updatePin when edit pin form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updatePin).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('Silbernadel'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updatePin).toHaveBeenCalled()
        })
    })
})

describe('ClubAdminPage — superadmin clubs CRUD extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['clubs', vi.fn()] as any)
        await setupDefaultApiMocks()
        await setupAsSuperadmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAllClubs).mockResolvedValue([
            { id: 1, name: 'TestClub', slug: 'testclub' },
        ] as any)
    })

    it('calls api.switchClub when switch button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.switchClub).mockResolvedValueOnce({ token: 'newtoken' } as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('TestClub'))
        const switchBtns = screen.getAllByText('superadmin.clubs.switch')
        fireEvent.click(switchBtns[0])
        await waitFor(() => {
            expect(api.switchClub).toHaveBeenCalledWith(1)
        })
    })

    it('calls api.createClub when create form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createClub).mockResolvedValueOnce({ id: 99, name: 'NewClub', slug: 'newclub' } as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('superadmin.clubs.create'))
        const nameInput = screen.getByPlaceholderText('superadmin.clubs.namePlaceholder')
        fireEvent.change(nameInput, { target: { value: 'BrandNewClub' } })
        // Trigger create via Enter key (onKeyDown handler)
        fireEvent.keyDown(nameInput, { key: 'Enter' })
        await waitFor(() => {
            expect(api.createClub).toHaveBeenCalledWith('BrandNewClub')
        })
    })

    it('opens edit club sheet when ✏️ clicked', async () => {
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('TestClub'))
        const editBtns = screen.getAllByText('✏️')
        fireEvent.click(editBtns[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('calls api.updateClub when edit club form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateClub).mockResolvedValueOnce({} as any)
        await renderClubAdminPage()
        await waitFor(() => screen.getByText('TestClub'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateClub).toHaveBeenCalled()
        })
    })
})

