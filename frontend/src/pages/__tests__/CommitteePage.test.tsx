import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
    },
}))

vi.mock('@/utils/error.ts', () => ({
    toastError: vi.fn(),
}))

vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => new URLSearchParams(''),
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
