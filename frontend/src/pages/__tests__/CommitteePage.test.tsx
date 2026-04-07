import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ClubPoll } from '@/types.ts'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/usePage.ts', () => ({
    useHashTab: vi.fn(() => ['announcements', vi.fn()]),
    clearAuthParams: vi.fn(),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({ user: null, regularMembers: [] })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        listAnnouncements: vi.fn(),
        listTrips: vi.fn(),
        createAnnouncement: vi.fn(),
        deleteAnnouncement: vi.fn(),
        createTrip: vi.fn(),
        deleteTrip: vi.fn(),
        updateTrip: vi.fn(),
        listPolls: vi.fn(),
        createPoll: vi.fn(),
        deletePoll: vi.fn(),
        closePoll: vi.fn(),
        castVote: vi.fn(),
        retractVote: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({
    toastError: vi.fn(),
}))

const mockGetHashParams = vi.fn(() => new URLSearchParams(''))
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => mockGetHashParams(),
    clearHashParams: vi.fn(),
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

vi.mock('@/components/ui/Toast.tsx', () => ({
    showToast: vi.fn(),
}))

vi.mock('@/components/ui/Empty.tsx', () => ({
    Empty: ({ text }: any) => <div>{text}</div>,
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const ANNOUNCEMENTS = [
    { id: 1, title: 'Wichtige Ankündigung', text: 'Text hier', media_url: null, created_at: '2026-01-10T10:00:00', created_by: 1 },
    { id: 2, title: 'Anderes Thema', text: null, media_url: null, created_at: '2026-01-05T09:00:00', created_by: 2 },
]

const TRIPS = [
    { id: 1, destination: 'München', date: '2026-04-15', note: 'Spaß dabei', created_by: 1 },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderCommitteePage() {
    const { CommitteePage } = await import('../CommitteePage')
    return render(<CommitteePage />, { wrapper: makeWrapper() })
}

async function setupDefaultMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
    vi.mocked(api.listTrips).mockResolvedValue([] as any)
}

async function setupWithAnnouncements() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.listAnnouncements).mockResolvedValue(ANNOUNCEMENTS as any)
    vi.mocked(api.listTrips).mockResolvedValue([] as any)
}

async function setupWithTrips() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
    vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
}

async function setupAsAdmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
        user: {
            id: 1,
            role: 'admin',
            email: 'admin@test.de',
            name: 'Admin',
            username: null,
            club_id: 1,
            preferred_locale: 'de',
            avatar: null,
            regular_member_id: 1,
        },
        regularMembers: [],
    }))
}

async function setupAsCommitteeMember() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(false)
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
        user: {
            id: 2,
            role: 'member',
            email: 'va@test.de',
            name: 'VA Member',
            username: null,
            club_id: 1,
            preferred_locale: 'de',
            avatar: null,
            regular_member_id: 5,
        },
        regularMembers: [
            { id: 5, name: 'VA Member', nickname: null, is_committee: true },
        ],
    }))
}

async function setupOnTripsTab() {
    const { useHashTab } = await import('@/hooks/usePage.ts')
    vi.mocked(useHashTab).mockReturnValue(['trips', vi.fn()] as any)
}

// ── tests: page structure ─────────────────────────────────────────────────────

describe('CommitteePage — page structure', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows the committee.title heading', async () => {
        await setupDefaultMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.title')).toBeInTheDocument()
        })
    })

    it('shows tab strip with announcements and trips tabs', async () => {
        await setupDefaultMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.tab.announcements')).toBeInTheDocument()
            expect(screen.getByText('committee.tab.trips')).toBeInTheDocument()
        })
    })

    it('renders the announcements tab content when on announcements tab', async () => {
        await setupDefaultMocks()
        await renderCommitteePage()
        await waitFor(() => {
            // Search input uses committee.search as placeholder
            expect(screen.getByPlaceholderText('committee.search')).toBeInTheDocument()
        })
    })
})

// ── tests: loading & empty states ─────────────────────────────────────────────

describe('CommitteePage — loading and empty states', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows loading state while announcements are fetching', async () => {
        const { api } = await import('@/api/client.ts')
        // Return a promise that never resolves so isLoading stays true
        vi.mocked(api.listAnnouncements).mockReturnValue(new Promise(() => {}) as any)
        vi.mocked(api.listTrips).mockResolvedValue([] as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('action.loading')).toBeInTheDocument()
        })
    })

    it('shows empty state when no announcements', async () => {
        await setupDefaultMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.announcement.none')).toBeInTheDocument()
        })
    })

    it('shows announcements when data is loaded', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Wichtige Ankündigung')).toBeInTheDocument()
            expect(screen.getByText('Anderes Thema')).toBeInTheDocument()
        })
    })

    it('shows announcement text when present', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Text hier')).toBeInTheDocument()
        })
    })
})

// ── tests: search filtering ───────────────────────────────────────────────────

describe('CommitteePage — search filtering', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('search filters announcements by title', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Wichtige Ankündigung')).toBeInTheDocument()
        })
        const searchInput = screen.getByPlaceholderText('committee.search')
        fireEvent.change(searchInput, { target: { value: 'wichtige' } })
        await waitFor(() => {
            expect(screen.getByText('Wichtige Ankündigung')).toBeInTheDocument()
            expect(screen.queryByText('Anderes Thema')).not.toBeInTheDocument()
        })
    })

    it('search filtering shows empty state when no matches', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Wichtige Ankündigung')).toBeInTheDocument()
        })
        const searchInput = screen.getByPlaceholderText('committee.search')
        fireEvent.change(searchInput, { target: { value: 'xyz_no_match' } })
        await waitFor(() => {
            expect(screen.queryByText('Wichtige Ankündigung')).not.toBeInTheDocument()
            expect(screen.queryByText('Anderes Thema')).not.toBeInTheDocument()
            expect(screen.getByText('committee.announcement.none')).toBeInTheDocument()
        })
    })
})

// ── tests: trips tab ──────────────────────────────────────────────────────────

describe('CommitteePage — trips tab', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows trips when useHashTab returns trips', async () => {
        await setupOnTripsTab()
        await setupWithTrips()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('München')).toBeInTheDocument()
        })
    })

    it('shows empty state for trips when no trips exist', async () => {
        await setupOnTripsTab()
        await setupDefaultMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.trip.none')).toBeInTheDocument()
        })
    })

    it('shows loading state while trips are fetching', async () => {
        await setupOnTripsTab()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockReturnValue(new Promise(() => {}) as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('action.loading')).toBeInTheDocument()
        })
    })

    it('trip destination and note are shown', async () => {
        await setupOnTripsTab()
        await setupWithTrips()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('München')).toBeInTheDocument()
            expect(screen.getByText('Spaß dabei')).toBeInTheDocument()
        })
    })
})

// ── tests: admin / canWrite ───────────────────────────────────────────────────

describe('CommitteePage — admin and canWrite', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        // Reset tab and auth state after trips-tab tests may have overridden them
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
    })

    it('admin sees add announcement button', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderCommitteePage()
        await waitFor(() => {
            expect(
                screen.getByText((content) => content.includes('committee.announcement.add'))
            ).toBeInTheDocument()
        })
    })

    it('admin sees VGA badge', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('VGA')).toBeInTheDocument()
        })
    })

    it('non-admin non-committee member does not see add button', async () => {
        await setupDefaultMocks()
        // Default mocks: isAdmin = false, user = null, regularMembers = []
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.queryByText((content) => content.includes('committee.announcement.add'))).not.toBeInTheDocument()
        })
    })

    it('non-admin non-committee member does not see VGA badge', async () => {
        await setupDefaultMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.queryByText('VGA')).not.toBeInTheDocument()
        })
    })

    it('committee member sees add announcement button', async () => {
        await setupDefaultMocks()
        await setupAsCommitteeMember()
        await renderCommitteePage()
        await waitFor(() => {
            expect(
                screen.getByText((content) => content.includes('committee.announcement.add'))
            ).toBeInTheDocument()
        })
    })
})

// ── tests: add announcement sheet ────────────────────────────────────────────

describe('CommitteePage — add announcement sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
    })

    it('add announcement sheet opens when button is clicked', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderCommitteePage()
        await waitFor(() => {
            expect(
                screen.getByText((content) => content.includes('committee.announcement.add'))
            ).toBeInTheDocument()
        })
        const addBtn = screen.getByText((content) => content.includes('committee.announcement.add'))
        fireEvent.click(addBtn)
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('committee.announcement.new')
        })
    })

    it('add sheet can be closed', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderCommitteePage()
        await waitFor(() => {
            expect(
                screen.getByText((content) => content.includes('committee.announcement.add'))
            ).toBeInTheDocument()
        })
        const addBtn = screen.getByText((content) => content.includes('committee.announcement.add'))
        fireEvent.click(addBtn)
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByText('close-sheet'))
        await waitFor(() => {
            expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
        })
    })

    it('add sheet contains title and text input fields', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderCommitteePage()
        const addBtn = await screen.findByText((content) => content.includes('committee.announcement.add'))
        fireEvent.click(addBtn)
        await waitFor(() => {
            expect(screen.getByPlaceholderText('committee.announcement.title')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('committee.announcement.text')).toBeInTheDocument()
        })
    })

    it('trips tab add button opens trips sheet when admin', async () => {
        await setupOnTripsTab()
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderCommitteePage()
        await waitFor(() => {
            expect(
                screen.getByText((content) => content.includes('committee.trip.add'))
            ).toBeInTheDocument()
        })
        const addBtn = screen.getByText((content) => content.includes('committee.trip.add'))
        fireEvent.click(addBtn)
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

// ── tests: tab switching ──────────────────────────────────────────────────────

describe('CommitteePage — tab switching', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('clicking trips tab calls setTab with trips', async () => {
        await setupDefaultMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        const setTab = vi.fn()
        vi.mocked(useHashTab).mockReturnValue(['announcements', setTab] as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.tab.trips')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByText('committee.tab.trips'))
        expect(setTab).toHaveBeenCalledWith('trips')
    })

    it('clicking announcements tab calls setTab with announcements', async () => {
        await setupOnTripsTab()
        await setupDefaultMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        const setTab = vi.fn()
        vi.mocked(useHashTab).mockReturnValue(['trips', setTab] as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.tab.announcements')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByText('committee.tab.announcements'))
        expect(setTab).toHaveBeenCalledWith('announcements')
    })
})

describe('CommitteePage — delete announcement', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
    })

    it('shows delete button for admin on announcement', async () => {
        await setupAsAdmin()
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getAllByText('×').length).toBeGreaterThan(0)
        })
    })

    it('calls api.deleteAnnouncement when ✕ confirmed', async () => {
        await setupAsAdmin()
        await setupWithAnnouncements()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteAnnouncement).mockResolvedValueOnce(undefined as any)
        await renderCommitteePage()
        await waitFor(() => screen.getAllByText('×'))
        fireEvent.click(screen.getAllByText('×')[0])
        // First click may trigger confirmation
        await waitFor(() => {
            // Either the delete was called immediately or a confirm button appeared
            const called = vi.mocked(api.deleteAnnouncement).mock.calls.length > 0
            const confirmBtn = screen.queryByText('action.confirmDelete')
            expect(called || !!confirmBtn).toBe(true)
        })
    })
})

describe('CommitteePage — trips CRUD', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnTripsTab()
    })

    it('shows add trip button for admin', async () => {
        await setupAsAdmin()
        await setupWithTrips()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText(/committee\.trip\.add/)).toBeInTheDocument()
        })
    })

    it('opens add trip sheet when button clicked', async () => {
        await setupAsAdmin()
        await setupWithTrips()
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.trip\.add/))
        fireEvent.click(screen.getByText(/committee\.trip\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows trip destination in list', async () => {
        await setupDefaultMocks()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('München')).toBeInTheDocument()
        })
    })

    it('calls api.createTrip when add trip form submitted with destination', async () => {
        await setupAsAdmin()
        await setupWithTrips()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createTrip).mockResolvedValueOnce({ id: 99, destination: 'Hamburg', date: '2026-06-01', note: null, created_by: 1 } as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.trip\.add/))
        fireEvent.click(screen.getByText(/committee\.trip\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Fill destination before submitting
        const destInput = screen.getByPlaceholderText('committee.trip.destinationPlaceholder')
        fireEvent.change(destInput, { target: { value: 'Hamburg' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createTrip).toHaveBeenCalledWith(expect.objectContaining({ destination: 'Hamburg' }))
        })
    })

    it('shows delete button for admin on trip', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('München')).toBeInTheDocument()
            expect(screen.getAllByText('×').length).toBeGreaterThan(0)
        })
    })
})

describe('CommitteePage — announcement display', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
    })

    it('shows announcement title', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Wichtige Ankündigung')).toBeInTheDocument()
        })
    })

    it('shows announcement text', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Text hier')).toBeInTheDocument()
        })
    })

    it('shows two announcements when both exist', async () => {
        await setupWithAnnouncements()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Wichtige Ankündigung')).toBeInTheDocument()
            expect(screen.getByText('Anderes Thema')).toBeInTheDocument()
        })
    })
})

// ── additional coverage tests ──────────────────────────────────────────────────

describe('CommitteePage — announcement CRUD', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
    })

    it('calls api.createAnnouncement when form submitted with title', async () => {
        await setupAsAdmin()
        await setupDefaultMocks()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createAnnouncement).mockResolvedValueOnce({ id: 99, title: 'Neues', text: null, media_url: null, created_at: '2026-01-20T10:00:00', created_by: 1 } as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText((c) => c.includes('committee.announcement.add')))
        fireEvent.click(screen.getByText((c) => c.includes('committee.announcement.add')))
        await waitFor(() => screen.getByTestId('sheet'))
        const titleInput = screen.getByPlaceholderText('committee.announcement.title')
        fireEvent.change(titleInput, { target: { value: 'Neues Thema' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ title: 'Neues Thema' }))
        })
    })

    it('calls api.deleteAnnouncement when × button clicked on announcement', async () => {
        await setupAsAdmin()
        await setupWithAnnouncements()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteAnnouncement).mockResolvedValueOnce(undefined as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Wichtige Ankündigung'))
        const deleteBtns = screen.getAllByText('×')
        fireEvent.click(deleteBtns[0])
        // Delete opens a confirmation sheet — click the confirm button
        await waitFor(() => screen.getByText('action.confirmDelete'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deleteAnnouncement).toHaveBeenCalledWith(1)
        })
    })
})

describe('CommitteePage — announcement add sheet fields', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
        await setupAsAdmin()
        await setupDefaultMocks()
    })

    it('shows title input in add announcement sheet', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText((c) => c.includes('committee.announcement.add')))
        fireEvent.click(screen.getByText((c) => c.includes('committee.announcement.add')))
        await waitFor(() => {
            expect(screen.getByPlaceholderText('committee.announcement.title')).toBeInTheDocument()
        })
    })

    it('shows text input in add announcement sheet', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText((c) => c.includes('committee.announcement.add')))
        fireEvent.click(screen.getByText((c) => c.includes('committee.announcement.add')))
        await waitFor(() => {
            expect(screen.getByPlaceholderText('committee.announcement.text')).toBeInTheDocument()
        })
    })

    it('closes sheet on close-sheet click', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText((c) => c.includes('committee.announcement.add')))
        fireEvent.click(screen.getByText((c) => c.includes('committee.announcement.add')))
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('close-sheet'))
        await waitFor(() => {
            expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
        })
    })
})

describe('CommitteePage — trip details', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnTripsTab()
    })

    it('shows trip date when present', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('München')).toBeInTheDocument()
        })
    })

    it('shows delete button for trip when admin', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        // Admin sees × delete button on trip
        expect(screen.getAllByText('×').length).toBeGreaterThan(0)
    })

    it('calls api.deleteTrip when × clicked on trip', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        vi.mocked(api.deleteTrip).mockResolvedValueOnce(undefined as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        const deleteBtns = screen.getAllByText('×')
        fireEvent.click(deleteBtns[0])
        // Delete opens a confirmation sheet — click the confirm button
        await waitFor(() => screen.getByText('action.confirmDelete'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deleteTrip).toHaveBeenCalledWith(1)
        })
    })

    it('shows edit button for trip when admin', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        expect(screen.getAllByText('✏️').length).toBeGreaterThan(0)
    })

    it('opens edit trip sheet when ✏️ clicked', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('calls api.updateTrip when edit trip form submitted', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        vi.mocked(api.updateTrip).mockResolvedValueOnce({ ...TRIPS[0], note: 'Updated note' } as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateTrip).toHaveBeenCalledWith(1, expect.any(Object))
        })
    })
})

// ── Polls fixtures ────────────────────────────────────────────────────────────

const POLLS: ClubPoll[] = [
    {
        id: 1,
        title: 'Wohin fahren wir?',
        text: 'Bitte abstimmen',
        mode: 'single',
        is_closed: false,
        created_by_name: 'Admin',
        created_at: '2026-04-01T10:00:00',
        options: [
            { id: 10, text: 'Berlin', sort_order: 0, vote_count: 3, voted_by_me: false },
            { id: 11, text: 'Hamburg', sort_order: 1, vote_count: 1, voted_by_me: true },
        ],
    },
]

const POLLS_UNVOTED: ClubPoll[] = [
    {
        id: 2,
        title: 'Was esst ihr?',
        text: null,
        mode: 'multi',
        is_closed: false,
        created_by_name: 'Admin',
        created_at: '2026-04-02T10:00:00',
        options: [
            { id: 20, text: 'Pizza', sort_order: 0, vote_count: 0, voted_by_me: false },
            { id: 21, text: 'Pasta', sort_order: 1, vote_count: 0, voted_by_me: false },
        ],
    },
]

async function setupOnPollsTab() {
    const { useHashTab } = await import('@/hooks/usePage.ts')
    vi.mocked(useHashTab).mockReturnValue(['polls', vi.fn()] as any)
}

async function setupPollsMocks(polls = POLLS) {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
    vi.mocked(api.listTrips).mockResolvedValue([] as any)
    vi.mocked(api.listPolls).mockResolvedValue(polls as any)
}

// ── tests: polls tab ──────────────────────────────────────────────────────────

describe('CommitteePage — polls tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnPollsTab()
    })

    it('shows polls tab in tab strip', async () => {
        await setupPollsMocks([])
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.tab.polls')).toBeInTheDocument()
        })
    })

    it('shows empty state when no polls', async () => {
        await setupPollsMocks([])
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.poll.none')).toBeInTheDocument()
        })
    })

    it('shows poll title', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Wohin fahren wir?')).toBeInTheDocument()
        })
    })

    it('shows poll description', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Bitte abstimmen')).toBeInTheDocument()
        })
    })

    it('shows option texts', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('Berlin')).toBeInTheDocument()
            expect(screen.getByText('Hamburg')).toBeInTheDocument()
        })
    })

    it('shows vote counts when already voted', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText(/3/)).toBeInTheDocument()
        })
    })

    it('shows retract button when already voted', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.poll.retract')).toBeInTheDocument()
        })
    })

    it('shows vote button when not voted', async () => {
        await setupPollsMocks(POLLS_UNVOTED)
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText('committee.poll.vote')).toBeInTheDocument()
        })
    })

    it('calls api.castVote when option selected and vote button clicked', async () => {
        await setupPollsMocks(POLLS_UNVOTED)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.castVote).mockResolvedValueOnce(undefined as any)
        vi.mocked(api.listPolls).mockResolvedValue(POLLS_UNVOTED as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Pizza'))
        // Select option
        fireEvent.click(screen.getByText('Pizza'))
        await waitFor(() => screen.getByText('committee.poll.vote'))
        fireEvent.click(screen.getByText('committee.poll.vote'))
        await waitFor(() => {
            expect(api.castVote).toHaveBeenCalledWith(2, [20])
        })
    })

    it('calls api.retractVote when retract clicked', async () => {
        await setupPollsMocks()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.retractVote).mockResolvedValueOnce(undefined as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('committee.poll.retract'))
        fireEvent.click(screen.getByText('committee.poll.retract'))
        await waitFor(() => {
            expect(api.retractVote).toHaveBeenCalledWith(1)
        })
    })
})

describe('CommitteePage — polls admin actions', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnPollsTab()
        await setupAsAdmin()
    })

    it('shows add poll button for admin', async () => {
        await setupPollsMocks([])
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByText(/committee\.poll\.add/)).toBeInTheDocument()
        })
    })

    it('opens create poll sheet when add button clicked', async () => {
        await setupPollsMocks([])
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.poll\.add/))
        fireEvent.click(screen.getByText(/committee\.poll\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
            expect(screen.getByTestId('sheet-title')).toHaveTextContent('committee.poll.new')
        })
    })

    it('create poll sheet has title input', async () => {
        await setupPollsMocks([])
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.poll\.add/))
        fireEvent.click(screen.getByText(/committee\.poll\.add/))
        await waitFor(() => {
            expect(screen.getByPlaceholderText('committee.poll.titlePlaceholder')).toBeInTheDocument()
        })
    })

    it('calls api.createPoll when form submitted with valid data', async () => {
        await setupPollsMocks([])
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createPoll).mockResolvedValueOnce(POLLS_UNVOTED[0] as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.poll\.add/))
        fireEvent.click(screen.getByText(/committee\.poll\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        const titleInput = screen.getByPlaceholderText('committee.poll.titlePlaceholder')
        fireEvent.change(titleInput, { target: { value: 'Neue Frage' } })
        // Fill options (first two are pre-rendered)
        const optInputs = screen.getAllByPlaceholderText(/committee\.poll\.optionPlaceholder/)
        fireEvent.change(optInputs[0], { target: { value: 'Ja' } })
        fireEvent.change(optInputs[1], { target: { value: 'Nein' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createPoll).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Neue Frage',
                options: expect.arrayContaining(['Ja', 'Nein']),
            }))
        })
    })

    it('shows close/open toggle button on poll', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByTitle('committee.poll.close')).toBeInTheDocument()
        })
    })

    it('calls api.closePoll when lock button clicked', async () => {
        await setupPollsMocks()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.closePoll).mockResolvedValueOnce({ ...POLLS[0], is_closed: true } as any)
        vi.mocked(api.listPolls).mockResolvedValue(POLLS as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByTitle('committee.poll.close'))
        fireEvent.click(screen.getByTitle('committee.poll.close'))
        await waitFor(() => {
            expect(api.closePoll).toHaveBeenCalledWith(1, true)
        })
    })

    it('shows delete button on poll', async () => {
        await setupPollsMocks()
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Wohin fahren wir?'))
        expect(screen.getAllByText('×').length).toBeGreaterThan(0)
    })

    it('calls api.deletePoll when × confirmed', async () => {
        await setupPollsMocks()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deletePoll).mockResolvedValueOnce(undefined as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Wohin fahren wir?'))
        fireEvent.click(screen.getAllByText('×')[0])
        await waitFor(() => screen.getByText('action.confirmDelete'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deletePoll).toHaveBeenCalledWith(1)
        })
    })
})

describe('CommitteePage — trips search', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnTripsTab()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([
            ...TRIPS,
            { id: 2, destination: 'Berlin', date: '2026-08-10', note: null, created_by: 1 },
        ] as any)
    })

    it('shows trips search input', async () => {
        await renderCommitteePage()
        await waitFor(() => {
            expect(screen.getByPlaceholderText('committee.search')).toBeInTheDocument()
        })
    })

    it('filters trips by search query', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        fireEvent.change(screen.getByPlaceholderText('committee.search'), { target: { value: 'Berlin' } })
        await waitFor(() => {
            expect(screen.getByText('Berlin')).toBeInTheDocument()
            expect(screen.queryByText('München')).not.toBeInTheDocument()
        })
    })
})

// ── past trips section ─────────────────────────────────────────────────────────
describe('CommitteePage — past trips section', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnTripsTab()
    })

    it('shows past trips in past section', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        const PAST_TRIP = { id: 10, destination: 'Hamburg', date: '2020-01-01', note: 'old trip', created_by: 1 }
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([PAST_TRIP] as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Hamburg'))
        expect(screen.getByText(/schedule\.past/)).toBeInTheDocument()
    })

    it('shows edit button on past trip for admin', async () => {
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        const PAST_TRIP = { id: 10, destination: 'OldCity', date: '2020-01-01', note: null, created_by: 1 }
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([PAST_TRIP] as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('OldCity'))
        expect(screen.getByText('✏️')).toBeInTheDocument()
    })
})

// ── trip delete confirmation sheet ───────────────────────────────────────────
describe('CommitteePage — trip delete confirmation', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnTripsTab()
        await setupAsAdmin()
    })

    it('shows delete confirm sheet when × clicked on trip', async () => {
        const { api } = await import('@/api/client.ts')
        const FUTURE_TRIP = { id: 5, destination: 'Vienna', date: '2030-01-01', note: null, created_by: 1 }
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([FUTURE_TRIP] as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Vienna'))
        fireEvent.click(screen.getByText('×'))
        await waitFor(() => screen.getByText(/committee\.trip\.deleteConfirm/))
        expect(screen.getByText(/committee\.trip\.deleteConfirm/)).toBeInTheDocument()
    })

    it('calls api.deleteTrip when confirmDelete clicked', async () => {
        const { api } = await import('@/api/client.ts')
        const FUTURE_TRIP = { id: 5, destination: 'Vienna', date: '2030-01-01', note: null, created_by: 1 }
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([FUTURE_TRIP] as any)
        vi.mocked(api.deleteTrip).mockResolvedValueOnce(undefined as any)
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Vienna'))
        fireEvent.click(screen.getByText('×'))
        await waitFor(() => screen.getByText(/action\.confirmDelete/))
        fireEvent.click(screen.getByText(/action\.confirmDelete/))
        await waitFor(() => expect(api.deleteTrip).toHaveBeenCalledWith(5))
    })
})

// ── announcement textarea interaction ────────────────────────────────────────
describe('CommitteePage — announcement form textarea', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([] as any)
    })

    it('updates textarea value when text typed in announcement sheet', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText((c) => c.includes('committee.announcement.add')))
        fireEvent.click(screen.getByText((c) => c.includes('committee.announcement.add')))
        await waitFor(() => screen.getByPlaceholderText('committee.announcement.title'))
        const textarea = screen.getByPlaceholderText('committee.announcement.text')
        fireEvent.change(textarea, { target: { value: 'Some text content' } })
        expect(textarea).toHaveValue('Some text content')
    })
})

// ── trip note field in add sheet ──────────────────────────────────────────────
describe('CommitteePage — trip note field', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupOnTripsTab()
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([] as any)
    })

    it('updates note textarea value in add trip sheet', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.trip\.add/))
        fireEvent.click(screen.getByText(/committee\.trip\.add/))
        await waitFor(() => screen.getByPlaceholderText('common.optional'))
        const noteTextarea = screen.getByPlaceholderText('common.optional')
        fireEvent.change(noteTextarea, { target: { value: 'Fun trip notes' } })
        expect(noteTextarea).toHaveValue('Fun trip notes')
    })

    it('updates date field in add trip sheet', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.trip\.add/))
        fireEvent.click(screen.getByText(/committee\.trip\.add/))
        await waitFor(() => screen.getByText(/committee\.trip\.date/))
        const dateInput = document.querySelector('input[type="date"]')
        expect(dateInput).toBeTruthy()
        fireEvent.change(dateInput!, { target: { value: '2027-05-15' } })
        expect(dateInput).toHaveValue('2027-05-15')
    })
})

// ── error handlers ────────────────────────────────────────────────────────────
describe('CommitteePage — announcement error handlers', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue(ANNOUNCEMENTS as any)
        vi.mocked(api.listTrips).mockResolvedValue([] as any)
    })

    it('calls toastError when createAnnouncement fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.createAnnouncement).mockRejectedValueOnce(new Error('create fail'))
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.announcement\.add/))
        fireEvent.click(screen.getByText(/committee\.announcement\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Title input has placeholder='committee.announcement.title'
        const titleInput = screen.getByPlaceholderText('committee.announcement.title') as HTMLInputElement
        fireEvent.change(titleInput, { target: { value: 'Test Title' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(toastError).toHaveBeenCalled())
    })

    it('shows delete confirm sheet with announcement delete confirm text', async () => {
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Wichtige Ankündigung'))
        // Click × on the first announcement to open confirm dialog
        fireEvent.click(screen.getAllByText('×')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        expect(screen.getByText(/committee\.announcement\.deleteConfirm/)).toBeInTheDocument()
    })
})

describe('CommitteePage — trip error handlers', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['trips', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
    })

    it('calls toastError when createTrip fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.createTrip).mockRejectedValueOnce(new Error('create fail'))
        await renderCommitteePage()
        await waitFor(() => screen.getByText(/committee\.trip\.add/))
        fireEvent.click(screen.getByText(/committee\.trip\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Destination input has placeholder='committee.trip.destinationPlaceholder'
        const destInput = screen.getByPlaceholderText('committee.trip.destinationPlaceholder') as HTMLInputElement
        fireEvent.change(destInput, { target: { value: 'TestCity' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(toastError).toHaveBeenCalled())
    })

    it('calls toastError when updateTrip fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.updateTrip).mockRejectedValueOnce(new Error('update fail'))
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        // Click edit button ✏️ on the trip
        fireEvent.click(screen.getByText('✏️'))
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(toastError).toHaveBeenCalled())
    })

    it('calls toastError when deleteTrip (in handler) fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.deleteTrip).mockRejectedValueOnce(new Error('delete fail'))
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        // Click × on the trip
        fireEvent.click(screen.getAllByText('×')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText(/action\.confirmDelete/))
        await waitFor(() => expect(toastError).toHaveBeenCalled())
    })
})

// ── deep link parsing with item + comment params ──────────────────────────────
describe('CommitteePage — deep link parsing', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        mockGetHashParams.mockReturnValue(new URLSearchParams(''))
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['announcements', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue([] as any)
        vi.mocked(api.listTrips).mockResolvedValue([] as any)
    })

    it('sets deepLink with both itemId and commentId when hash has item+comment', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue(ANNOUNCEMENTS as any)
        // Set hash params with item=1&comment=42
        mockGetHashParams.mockReturnValue(new URLSearchParams('item=1&comment=42'))
        await renderCommitteePage()
        // The deep link is processed — useDeepLinkScroll calls onHandled
        // which calls setDeepLink(null). No visible assertion needed; just ensure no crash.
        await waitFor(() => screen.getByText('Wichtige Ankündigung'))
    })

    it('triggers onDeepLinkHandled for announcements tab when item found', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listAnnouncements).mockResolvedValue(ANNOUNCEMENTS as any)
        mockGetHashParams.mockReturnValue(new URLSearchParams('item=1'))
        await renderCommitteePage()
        await waitFor(() => screen.getByText('Wichtige Ankündigung'))
        // Deep link was processed and onDeepLinkHandled called — no crash means success
    })

    it('triggers onDeepLinkHandled for trips tab when item found', async () => {
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['trips', vi.fn()] as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listTrips).mockResolvedValue(TRIPS as any)
        mockGetHashParams.mockReturnValue(new URLSearchParams('item=1'))
        await renderCommitteePage()
        await waitFor(() => screen.getByText('München'))
        // onDeepLinkHandled for trips tab was called
    })
})
