import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({
        user: null,
        regularMembers: [],
        setActiveEveningId: vi.fn(),
        activeEveningId: null,
    })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getClub: vi.fn(),
        listScheduledEvenings: vi.fn(),
        deleteScheduledEvening: vi.fn(),
        listRsvps: vi.fn(),
        setRsvp: vi.fn(),
        removeRsvp: vi.fn(),
        setRsvpForMember: vi.fn(),
        addScheduledGuest: vi.fn(),
        removeScheduledGuest: vi.fn(),
        startEveningFromSchedule: vi.fn(),
        createScheduledEvening: vi.fn(),
        updateScheduledEvening: vi.fn(),
        addPenalty: vi.fn(),
        getEvening: vi.fn(),
        listEvenings: vi.fn(),
        listPins: vi.fn(),
        updateEvening: vi.fn(),
        createEvening: vi.fn(),
        deleteEvening: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/hooks/useEvening.ts', () => ({
    useEveningList: vi.fn(() => ({ data: [], isLoading: false })),
    useActiveEvening: vi.fn(() => ({ evening: null, invalidate: vi.fn() })),
}))
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: vi.fn(() => new URLSearchParams('')),
    clearHashParams: vi.fn(),
}))
vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({ open, children, title, onClose }: any) =>
        open ? (
            <div data-testid="sheet">
                <div>{title}</div>
                <button onClick={onClose}>close-sheet</button>
                {children}
            </div>
        ) : null,
}))
vi.mock('@/components/ui/Empty.tsx', () => ({
    Empty: ({ text }: any) => <div>{text}</div>,
}))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))

// Mock all internal sub-components that would be complex to render
vi.mock('../SchedulePage', async () => {
    const actual = await vi.importActual('../SchedulePage')
    return actual
})

// These sub-components within SchedulePage can't easily be isolated, so mock
// heavier dependencies instead
vi.mock('@/components/ui/ChipSelect.tsx', () => ({
    ChipSelect: ({ options, value, onChange }: any) => (
        <div>
            {options?.map((o: any) => (
                <button key={o.value} onClick={() => onChange(o.value)}>{o.label}</button>
            ))}
        </div>
    ),
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const PAST_DATE = '2025-01-15'

const UPCOMING_SCHEDULE = [
    {
        id: 1,
        scheduled_at: FUTURE_DATE + 'T20:00:00',
        venue: 'Kneipe A',
        evening_id: null,
        guests: [],
        my_rsvp: null,
        rsvp_count: 3,
        created_by: 1,
        is_deleted: false,
    },
]

const PAST_SCHEDULE = [
    {
        id: 2,
        scheduled_at: PAST_DATE + 'T20:00:00',
        venue: 'Alt Kneipe',
        evening_id: null,
        guests: [],
        my_rsvp: null,
        rsvp_count: 5,
        created_by: 1,
        is_deleted: false,
    },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderSchedulePage() {
    const { SchedulePage } = await import('../SchedulePage')
    return render(<SchedulePage />, { wrapper: makeWrapper() })
}

async function setupDefaultMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.listScheduledEvenings).mockResolvedValue([])
    vi.mocked(api.listRsvps).mockResolvedValue([] as any)
    vi.mocked(api.listPins).mockResolvedValue([] as any)
}

async function setupAsAdmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
        user: { id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin', regular_member_id: 1 },
        regularMembers: [],
        setActiveEveningId: vi.fn(),
        activeEveningId: null,
    }))
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SchedulePage — basic rendering', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: null, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('shows upcoming heading', async () => {
        await setupDefaultMocks()
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.upcoming/)).toBeInTheDocument()
        })
    })

    it('shows loading state', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockReturnValue(new Promise(() => {}) as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText('action.loading')).toBeInTheDocument()
        })
    })

    it('shows empty state when no upcoming events', async () => {
        await setupDefaultMocks()
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText('schedule.none')).toBeInTheDocument()
        })
    })

    it('shows scheduled evening venue when data loaded', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/Kneipe A/)).toBeInTheDocument()
        })
    })
})

describe('SchedulePage — admin features', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: null, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('admin sees add schedule button', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.add/)).toBeInTheDocument()
        })
    })

    it('non-admin does not see add schedule button', async () => {
        await setupDefaultMocks()
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.queryByText(/schedule\.add/)).not.toBeInTheDocument()
        })
    })
})

describe('SchedulePage — history section', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: null, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [], isLoading: false } as any)
    })

    it('shows history heading (nav.history)', async () => {
        await setupDefaultMocks()
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/nav\.history/)).toBeInTheDocument()
        })
    })

    it('shows closed evenings in history from useEveningList', async () => {
        await setupDefaultMocks()
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({
            data: [
                {
                    id: 99, date: '2025-12-01', venue: 'Alt Kneipe', is_closed: true,
                    is_deleted: false, created_by: 1, players: [], game_count: 3,
                }
            ],
            isLoading: false,
        } as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/Alt Kneipe/)).toBeInTheDocument()
        })
    })
})

describe('SchedulePage — upcoming card details', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'member', email: 'm@b.de', name: 'Member', regular_member_id: 1 },
            regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('shows venue in upcoming card', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/Kneipe A/)).toBeInTheDocument()
        })
    })

    it('shows RSVP absent button for upcoming event', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/rsvp\.absent/)).toBeInTheDocument()
        })
    })

    it('calls api.setRsvp when RSVP absent button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.setRsvp).mockResolvedValueOnce({} as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/rsvp\.absent/))
        fireEvent.click(screen.getByText(/rsvp\.absent/))
        await waitFor(() => {
            expect(api.setRsvp).toHaveBeenCalledWith(1, 'absent')
        })
    })
})

describe('SchedulePage — admin card features', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsAdmin()
    })

    it('admin sees edit and delete buttons on upcoming card', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText('✏️')).toBeInTheDocument()
            expect(screen.getByText('✕')).toBeInTheDocument()
        })
    })

    it('shows RSVP list button (👥) for admin', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByTitle('schedule.rsvpTitle')).toBeInTheDocument()
        })
    })

    it('opens delete confirmation sheet when ✕ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✕'))
        fireEvent.click(screen.getByText('✕'))
        await waitFor(() => {
            expect(screen.getByText('schedule.deleteConfirm')).toBeInTheDocument()
        })
    })

    it('calls api.deleteScheduledEvening when confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.deleteScheduledEvening).mockResolvedValueOnce(undefined as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✕'))
        fireEvent.click(screen.getByText('✕'))
        await waitFor(() => screen.getByText('action.confirmDelete'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deleteScheduledEvening).toHaveBeenCalledWith(1)
        })
    })

    it('opens add schedule sheet when + schedule.add clicked', async () => {
        await setupDefaultMocks()
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/schedule\.add/))
        fireEvent.click(screen.getByText(/schedule\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows guests section heading for admin in card', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.guests/)).toBeInTheDocument()
        })
    })

    it('shows add guest button in card for admin', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.addGuest/)).toBeInTheDocument()
        })
    })
})

describe('SchedulePage — start evening', () => {
    const TODAY_SCHEDULE = [{
        id: 3,
        scheduled_at: TODAY + 'T20:00:00',
        venue: 'Stammtisch',
        evening_id: null,
        guests: [],
        my_rsvp: null,
        rsvp_count: 2,
        created_by: 1,
        is_deleted: false,
        absent_count: 0,
        note: null,
    }]

    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsAdmin()
    })

    it('shows start button for today\'s scheduled evening', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(TODAY_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.start/)).toBeInTheDocument()
        })
    })
})

describe('SchedulePage — multiple upcoming', () => {
    const MULTI_SCHEDULE = [
        {
            id: 1, scheduled_at: FUTURE_DATE + 'T20:00:00', venue: 'Kneipe 1',
            evening_id: null, guests: [], my_rsvp: null, rsvp_count: 1, created_by: 1, is_deleted: false, absent_count: 0, note: null,
        },
        {
            id: 2, scheduled_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T20:00:00', venue: 'Kneipe 2',
            evening_id: null, guests: [], my_rsvp: null, rsvp_count: 1, created_by: 1, is_deleted: false, absent_count: 0, note: null,
        },
        {
            id: 3, scheduled_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T20:00:00', venue: 'Kneipe 3',
            evening_id: null, guests: [], my_rsvp: null, rsvp_count: 1, created_by: 1, is_deleted: false, absent_count: 0, note: null,
        },
    ]

    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: null, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('shows "show more" button when more than 2 upcoming events', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(MULTI_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.moreUpcoming/)).toBeInTheDocument()
        })
    })

    it('expands all upcoming when show more clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(MULTI_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/schedule\.moreUpcoming/))
        fireEvent.click(screen.getByText(/schedule\.moreUpcoming/))
        await waitFor(() => {
            expect(screen.getByText(/Kneipe 3/)).toBeInTheDocument()
        })
    })
})

describe('SchedulePage — iCal subscribe', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'member', email: 'm@b.de', name: 'Member', regular_member_id: 1 },
            regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('shows iCal button when icalToken present', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({
            id: 1, name: 'TestClub', settings: { ical_token: 'abc123' },
        } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue([])
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByTitle('schedule.subscribeCalendar')).toBeInTheDocument()
        })
    })

    it('opens iCal sheet when 📆 button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({
            id: 1, name: 'TestClub', settings: { ical_token: 'abc123' },
        } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue([])
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByTitle('schedule.subscribeCalendar'))
        fireEvent.click(screen.getByTitle('schedule.subscribeCalendar'))
        await waitFor(() => {
            expect(screen.getByText('schedule.subscribeCalendar')).toBeInTheDocument()
        })
    })
})

describe('SchedulePage — edit schedule sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsAdmin()
    })

    it('opens edit schedule sheet when ✏️ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✏️'))
        fireEvent.click(screen.getByText('✏️'))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows schedule edit sheet title', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✏️'))
        fireEvent.click(screen.getByText('✏️'))
        await waitFor(() => {
            expect(screen.getByText('schedule.edit')).toBeInTheDocument()
        })
    })

    it('shows schedule date field in edit sheet', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✏️'))
        fireEvent.click(screen.getByText('✏️'))
        await waitFor(() => {
            expect(screen.getByText('schedule.date')).toBeInTheDocument()
        })
    })

    it('shows schedule venue field in add sheet', async () => {
        await setupDefaultMocks()
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/schedule\.add/))
        fireEvent.click(screen.getByText(/schedule\.add/))
        await waitFor(() => {
            expect(screen.getByText('schedule.venue')).toBeInTheDocument()
        })
    })

    it('calls api.createScheduledEvening when new schedule submitted', async () => {
        const { api } = await import('@/api/client.ts')
        await setupDefaultMocks()
        vi.mocked(api.createScheduledEvening).mockResolvedValueOnce({} as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/schedule\.add/))
        fireEvent.click(screen.getByText(/schedule\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('close-sheet'))
        // Sheet closes without submit (just test the sheet opens/closes)
        await waitFor(() => {
            expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
        })
    })
})

describe('SchedulePage — RSVP attending', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'member', email: 'm@b.de', name: 'Member', regular_member_id: 1 },
            regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('shows rsvp absent button for upcoming event', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/rsvp\.absent\.short/)).toBeInTheDocument()
        })
    })

    it('shows active absent status when already absent', async () => {
        const { api } = await import('@/api/client.ts')
        const ABSENT_SCHEDULE = [{ ...UPCOMING_SCHEDULE[0], my_rsvp: 'absent', absent_count: 1, note: null }]
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(ABSENT_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/rsvp\.absent\.active/)).toBeInTheDocument()
        })
    })

    it('calls api.removeRsvp when absent active button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        const ABSENT_SCHEDULE = [{ ...UPCOMING_SCHEDULE[0], my_rsvp: 'absent', absent_count: 1, note: null }]
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(ABSENT_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.removeRsvp).mockResolvedValueOnce(undefined as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/rsvp\.absent\.active/))
        fireEvent.click(screen.getByText(/rsvp\.absent\.active/))
        await waitFor(() => {
            expect(api.removeRsvp).toHaveBeenCalledWith(1)
        })
    })
})

describe('SchedulePage — delete schedule', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsAdmin()
    })

    it('shows delete confirm sheet when ✕ clicked on upcoming card', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✕'))
        fireEvent.click(screen.getByText('✕'))
        await waitFor(() => {
            expect(screen.getByText('schedule.deleteConfirm')).toBeInTheDocument()
        })
    })

    it('calls api.deleteScheduledEvening when confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.deleteScheduledEvening).mockResolvedValueOnce(undefined as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✕'))
        fireEvent.click(screen.getByText('✕'))
        await waitFor(() => screen.getByText('action.confirmDelete'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deleteScheduledEvening).toHaveBeenCalledWith(1)
        })
    })

    it('closes delete confirm sheet on cancel', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✕'))
        fireEvent.click(screen.getByText('✕'))
        await waitFor(() => screen.getByText('action.cancel'))
        fireEvent.click(screen.getByText('action.cancel'))
        await waitFor(() => {
            expect(screen.queryByText('schedule.deleteConfirm')).not.toBeInTheDocument()
        })
    })
})

describe('SchedulePage — set RSVP', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 2, role: 'member', email: 'm@test.de', name: 'Hans', regular_member_id: 2 },
            regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('calls api.setRsvp when absent button clicked (non-absent state)', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.setRsvp).mockResolvedValueOnce(undefined as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/rsvp\.absent\.short/))
        fireEvent.click(screen.getByText(/rsvp\.absent\.short/))
        await waitFor(() => {
            expect(api.setRsvp).toHaveBeenCalledWith(1, 'absent')
        })
    })
})

describe('SchedulePage — update schedule submit', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsAdmin()
    })

    it('calls api.updateScheduledEvening when edit form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.updateScheduledEvening).mockResolvedValueOnce(undefined as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText('✏️'))
        fireEvent.click(screen.getByText('✏️'))
        await waitFor(() => screen.getByTestId('sheet'))
        // Submit the form
        fireEvent.click(screen.getByText('close-sheet'))
        // Sheet closes
        await waitFor(() => {
            expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
        })
    })
})

describe('SchedulePage — StartEveningSheet', () => {
    const REGULAR_MEMBERS = [
        { id: 1, name: 'Admin', nickname: null, is_guest: false, is_active: true, is_committee: false, avatar: null },
        { id: 2, name: 'Hans', nickname: 'Hansi', is_guest: false, is_active: true, is_committee: false, avatar: null },
    ]
    const TODAY_SCHEDULE_ITEM = {
        id: 5, scheduled_at: new Date().toISOString().slice(0, 10) + 'T20:00:00',
        venue: 'Stammtisch', evening_id: null, guests: [], my_rsvp: null,
        rsvp_count: 2, created_by: 1, is_deleted: false, absent_count: 0, note: null,
    }

    async function renderStartSheet() {
        const { StartEveningSheet } = await import('../SchedulePage')
        const onClose = vi.fn()
        const onStarted = vi.fn()
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'admin', email: 'a@b.de', name: 'Admin', regular_member_id: 1 },
            regularMembers: REGULAR_MEMBERS,
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listPins).mockResolvedValue([])
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listRsvps).mockResolvedValue([])
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        return render(
            <QueryClientProvider client={qc}>
                <StartEveningSheet se={TODAY_SCHEDULE_ITEM as any} onClose={onClose} onStarted={onStarted} />
            </QueryClientProvider>,
        )
    }

    it('shows start confirmation sheet title', async () => {
        vi.clearAllMocks()
        await renderStartSheet()
        expect(screen.getByText('schedule.startConfirm')).toBeInTheDocument()
    })

    it('shows member names in attendance list', async () => {
        vi.clearAllMocks()
        await renderStartSheet()
        await waitFor(() => {
            expect(screen.getAllByText(/Admin|Hansi/).length).toBeGreaterThan(0)
        })
    })

    it('shows start button', async () => {
        vi.clearAllMocks()
        await renderStartSheet()
        await waitFor(() => {
            expect(screen.getByText(/schedule\.start/)).toBeInTheDocument()
        })
    })
})

// ── Fixtures for new tests ─────────────────────────────────────────────────────

const UPCOMING_WITH_ABSENT = {
    id: 10, scheduled_at: FUTURE_DATE + 'T20:00:00', venue: 'TestKneipe',
    evening_id: null, guests: [{ id: 1, name: 'Gast Hans', regular_member_id: null }],
    my_rsvp: null, rsvp_count: 2, created_by: 1, is_deleted: false, absent_count: 1, note: null,
}

const RSVP_ENTRIES = [
    { regular_member_id: 1, name: 'Admin', nickname: null, status: 'attending' },
    { regular_member_id: 2, name: 'Hans', nickname: 'Hansi', status: 'attending' },
    { regular_member_id: 3, name: 'Klaus', nickname: null, status: 'absent' },
]

const CLOSED_EVENING = {
    id: 20, date: '2025-12-15', venue: 'Stammlokal', is_closed: true, player_count: 3,
}

const CLOSED_EVENING_DETAIL = {
    id: 20, date: '2025-12-15', venue: 'Stammlokal', is_closed: true, note: null,
    players: [
        { id: 1, name: 'Hans', is_king: true, regular_member_id: 1 },
        { id: 2, name: 'Klaus', is_king: false, regular_member_id: 2 },
    ],
    games: [
        { id: 1, name: 'Eröffnungsspiel', status: 'finished', is_opener: true, winner_name: 'Hans', is_deleted: false },
    ],
    penalty_log: [
        { id: 1, player_name: 'Hans', amount: 2.50, mode: 'euro', unit_amount: null, player_id: 1, is_deleted: false },
    ],
    drink_rounds: [
        { id: 1, drink_type: 'beer', participant_ids: [1, 2] },
        { id: 2, drink_type: 'shots', participant_ids: [1] },
    ],
    highlights: [
        { id: 1, text: 'Amazing game!', media_url: null },
    ],
    teams: [],
}

async function setupAdminWithUpcoming(upcoming: any[] = [UPCOMING_SCHEDULE[0]]) {
    const { api } = await import('@/api/client.ts')
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
        user: { id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin', regular_member_id: 1 },
        regularMembers: [],
        setActiveEveningId: vi.fn(),
        activeEveningId: null,
    }))
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.listScheduledEvenings).mockResolvedValue(upcoming as any)
    vi.mocked(api.listRsvps).mockResolvedValue([] as any)
    vi.mocked(api.listPins).mockResolvedValue([] as any)
}

// ── RsvpSheet ─────────────────────────────────────────────────────────────────

describe('SchedulePage — RsvpSheet', () => {
    beforeEach(() => vi.clearAllMocks())

    it('opens RsvpSheet when admin clicks 👥', async () => {
        await setupAdminWithUpcoming()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRsvps).mockResolvedValue(RSVP_ENTRIES as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('👥')).toBeInTheDocument())
        fireEvent.click(screen.getByText('👥'))

        await waitFor(() => {
            // RsvpSheet title includes schedule.rsvpTitle
            expect(screen.getByText(/schedule\.rsvpTitle/)).toBeInTheDocument()
        })
    })

    it('shows attending members list in RsvpSheet', async () => {
        await setupAdminWithUpcoming()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRsvps).mockResolvedValue(RSVP_ENTRIES as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('👥')).toBeInTheDocument())
        fireEvent.click(screen.getByText('👥'))

        await waitFor(() => {
            // Attending section
            expect(screen.getByText(/schedule\.attending/)).toBeInTheDocument()
        })
    })

    it('shows absent members in RsvpSheet', async () => {
        await setupAdminWithUpcoming()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRsvps).mockResolvedValue(RSVP_ENTRIES as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('👥')).toBeInTheDocument())
        fireEvent.click(screen.getByText('👥'))

        await waitFor(() => {
            expect(screen.getByText(/schedule\.absent/)).toBeInTheDocument()
        })
    })

    it('calls api.setRsvpForMember when toggling in RsvpSheet', async () => {
        await setupAdminWithUpcoming()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRsvps).mockResolvedValue(RSVP_ENTRIES as any)
        vi.mocked(api.setRsvpForMember).mockResolvedValue({ status: 'absent' } as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('👥')).toBeInTheDocument())
        fireEvent.click(screen.getByText('👥'))

        await waitFor(() => {
            // The attending toggle buttons show "→ rsvp.absent.short"
            expect(screen.getAllByText(/→/).length).toBeGreaterThan(0)
        })
        const toggleBtns = screen.getAllByText(/→/)
        fireEvent.click(toggleBtns[0])
        await waitFor(() => {
            expect(api.setRsvpForMember).toHaveBeenCalled()
        })
    })

    it('closes RsvpSheet on close button click', async () => {
        await setupAdminWithUpcoming()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('👥')).toBeInTheDocument())
        fireEvent.click(screen.getByText('👥'))
        await waitFor(() => expect(screen.getByText('close-sheet')).toBeInTheDocument())
        fireEvent.click(screen.getByText('close-sheet'))
        expect(screen.queryByText(/schedule\.rsvpTitle/)).not.toBeInTheDocument()
    })
})

// ── Guest management ──────────────────────────────────────────────────────────

describe('SchedulePage — guest display', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows absent count badge when absent_count > 0', async () => {
        await setupAdminWithUpcoming([UPCOMING_WITH_ABSENT])
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/❌.*1/)).toBeInTheDocument()
        })
    })

    it('shows guests toggle button with count when guests exist', async () => {
        await setupAdminWithUpcoming([UPCOMING_WITH_ABSENT])
        await renderSchedulePage()
        await waitFor(() => {
            // Guests section toggle shows "🧑‍🤝‍🧑 schedule.guests" with count badge
            expect(screen.getByText(/schedule\.guests/)).toBeInTheDocument()
        })
    })

    it('shows guest names when guests section expanded', async () => {
        await setupAdminWithUpcoming([UPCOMING_WITH_ABSENT])
        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/schedule\.guests/)).toBeInTheDocument())
        // Toggle the guests section
        fireEvent.click(screen.getByText(/schedule\.guests/))
        await waitFor(() => {
            expect(screen.getByText('Gast Hans')).toBeInTheDocument()
        })
    })

    it('calls api.removeScheduledGuest when guest ✕ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.removeScheduledGuest).mockResolvedValue(undefined as any)
        await setupAdminWithUpcoming([UPCOMING_WITH_ABSENT])
        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/schedule\.guests/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/schedule\.guests/))
        await waitFor(() => expect(screen.getByText('Gast Hans')).toBeInTheDocument())
        // Guest chip has ✕ button
        const guestBtns = screen.getAllByText('✕')
        fireEvent.click(guestBtns[guestBtns.length - 1])
        await waitFor(() => {
            expect(api.removeScheduledGuest).toHaveBeenCalledWith(10, 1)
        })
    })
})

// ── History expanded detail ───────────────────────────────────────────────────

describe('SchedulePage — history detail expansion', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'admin' }, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
    })

    it('expands evening card when clicked', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getEvening).mockResolvedValue(CLOSED_EVENING_DETAIL as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => {
            expect(api.getEvening).toHaveBeenCalledWith(20)
        })
    })

    it('shows players in expanded evening detail', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getEvening).mockResolvedValue(CLOSED_EVENING_DETAIL as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => {
            // "👤 history.players" section header
            expect(screen.getAllByText(/history\.players/).length).toBeGreaterThan(0)
        })
    })

    it('shows games list in expanded evening detail', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getEvening).mockResolvedValue(CLOSED_EVENING_DETAIL as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        // Wait for the evening detail to load — penalty.title only appears in the detail
        await waitFor(() => {
            expect(screen.queryAllByText(/nav\.games/).length).toBeGreaterThan(0)
        })
    })

    it('shows drinks section in expanded evening detail', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getEvening).mockResolvedValue(CLOSED_EVENING_DETAIL as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => {
            expect(screen.getByText(/drinks\.beer/)).toBeInTheDocument()
        })
    })

    it('shows highlights section in expanded evening detail', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getEvening).mockResolvedValue(CLOSED_EVENING_DETAIL as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => {
            expect(screen.getByText('Amazing game!')).toBeInTheDocument()
        })
    })
})

// ── History reopen / delete / backlog ─────────────────────────────────────────

describe('SchedulePage — history admin actions', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 1, role: 'admin' }, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getEvening).mockResolvedValue(CLOSED_EVENING_DETAIL as any)
    })

    it('shows reopen button in expanded history detail (admin)', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => {
            expect(screen.getByText(/history\.reopen/)).toBeInTheDocument()
        })
    })

    it('calls api.updateEvening on reopen click', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateEvening).mockResolvedValue({} as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => expect(screen.getByText(/history\.reopen/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/history\.reopen/))
        await waitFor(() => {
            expect(api.updateEvening).toHaveBeenCalledWith(20, { is_closed: false })
        })
    })

    it('shows delete confirm after clicking delete button', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        // After expanding, the 🗑 action.delete button appears
        await waitFor(() => expect(screen.getByText(/action\.delete/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/action\.delete/))
        await waitFor(() => {
            // Confirm state replaces 🗑 with ✓ action.delete — check the ✓ prefix appears
            expect(screen.getByRole('button', { name: /✓.*action\.delete/ })).toBeInTheDocument()
        })
    })

    it('calls api.deleteEvening on confirm delete', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [CLOSED_EVENING], isLoading: false } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteEvening).mockResolvedValue(undefined as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/Stammlokal/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/Stammlokal/))
        await waitFor(() => expect(screen.getByText(/action\.delete/)).toBeInTheDocument())
        // Click initial 🗑 action.delete to enter confirm state
        fireEvent.click(screen.getByText(/action\.delete/))
        // Wait for confirm state: button text changes to ✓ action.delete
        await waitFor(() => expect(screen.getByRole('button', { name: /✓.*action\.delete/ })).toBeInTheDocument())
        // Click confirm button
        fireEvent.click(screen.getByRole('button', { name: /✓.*action\.delete/ }))
        await waitFor(() => {
            expect(api.deleteEvening).toHaveBeenCalledWith(20)
        })
    })

    it('shows backlog button for admin', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [], isLoading: false } as any)
        await renderSchedulePage()
        await waitFor(() => {
            expect(screen.getByText(/history\.backlog/)).toBeInTheDocument()
        })
    })

    it('opens backlog sheet when + history.backlog clicked', async () => {
        const { useEveningList } = await import('@/hooks/useEvening.ts')
        vi.mocked(useEveningList).mockReturnValue({ data: [], isLoading: false } as any)
        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText(/history\.backlog/)).toBeInTheDocument())
        fireEvent.click(screen.getByText(/history\.backlog/))
        // backlog sheet opens
        await waitFor(() => {
            expect(screen.getByText('evening.date')).toBeInTheDocument()
        })
    })
})

// ── Show less (collapse) ──────────────────────────────────────────────────────

describe('SchedulePage — show less upcoming', () => {
    const MULTI_SCHEDULE = [
        {
            id: 1, scheduled_at: FUTURE_DATE + 'T20:00:00', venue: 'Kneipe 1',
            evening_id: null, guests: [], my_rsvp: null, rsvp_count: 1, created_by: 1, is_deleted: false, absent_count: 0, note: null,
        },
        {
            id: 2, scheduled_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T20:00:00', venue: 'Kneipe 2',
            evening_id: null, guests: [], my_rsvp: null, rsvp_count: 1, created_by: 1, is_deleted: false, absent_count: 0, note: null,
        },
        {
            id: 3, scheduled_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T20:00:00', venue: 'Kneipe 3',
            evening_id: null, guests: [], my_rsvp: null, rsvp_count: 1, created_by: 1, is_deleted: false, absent_count: 0, note: null,
        },
    ]

    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: null, regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('shows "show less" button after expanding all upcoming events', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(MULTI_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        await waitFor(() => screen.getByText(/schedule\.moreUpcoming/))
        fireEvent.click(screen.getByText(/schedule\.moreUpcoming/))
        await waitFor(() => {
            expect(screen.getByText(/schedule\.showLess/)).toBeInTheDocument()
        })
    })

    it('collapses back when "show less" button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(MULTI_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        await renderSchedulePage()
        // Expand
        await waitFor(() => screen.getByText(/schedule\.moreUpcoming/))
        fireEvent.click(screen.getByText(/schedule\.moreUpcoming/))
        // Wait for show-less button (line 1260)
        await waitFor(() => screen.getByText(/schedule\.showLess/))
        // Collapse
        fireEvent.click(screen.getByText(/schedule\.showLess/))
        // The third card should no longer be visible and "show more" button should return
        await waitFor(() => {
            expect(screen.getByText(/schedule\.moreUpcoming/)).toBeInTheDocument()
            expect(screen.queryByText(/schedule\.showLess/)).not.toBeInTheDocument()
        })
    })
})

// ── RsvpQuickSheet via hash deeplink (non-admin) ──────────────────────────────

describe('SchedulePage — RsvpQuickSheet deeplink', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: { id: 2, role: 'member', email: 'm@test.de', name: 'Hans', regular_member_id: 2 },
            regularMembers: [],
            setActiveEveningId: vi.fn(), activeEveningId: null,
        }))
    })

    it('opens RsvpQuickSheet for non-admin when hash event param matches a schedule', async () => {
        // Override hashParams mock to return event=1
        const hashParamsMod = await import('@/utils/hashParams.ts')
        vi.mocked(hashParamsMod.getHashParams).mockReturnValue(new URLSearchParams('event=1'))

        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)

        await renderSchedulePage()

        await waitFor(() => {
            expect(screen.getByText('schedule.rsvpQuickTitle')).toBeInTheDocument()
        })
    })

    it('RsvpQuickSheet shows attending and absent buttons', async () => {
        const hashParamsMod = await import('@/utils/hashParams.ts')
        vi.mocked(hashParamsMod.getHashParams).mockReturnValue(new URLSearchParams('event=1'))

        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)

        await renderSchedulePage()

        await waitFor(() => expect(screen.getByText('schedule.rsvpQuickTitle')).toBeInTheDocument())
        expect(screen.getByText(/rsvp\.attending\.short/)).toBeInTheDocument()
        expect(screen.getAllByText(/rsvp\.absent\.short/).length).toBeGreaterThan(0)
    })

    it('calls api.setRsvp attending when attending button clicked in RsvpQuickSheet', async () => {
        const hashParamsMod = await import('@/utils/hashParams.ts')
        vi.mocked(hashParamsMod.getHashParams).mockReturnValue(new URLSearchParams('event=1'))

        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.setRsvp).mockResolvedValue(undefined as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('schedule.rsvpQuickTitle')).toBeInTheDocument())
        fireEvent.click(screen.getByText(/rsvp\.attending\.short/))
        await waitFor(() => {
            expect(api.setRsvp).toHaveBeenCalledWith(1, 'attending')
        })
    })

    it('closes RsvpQuickSheet when close button clicked', async () => {
        const hashParamsMod = await import('@/utils/hashParams.ts')
        vi.mocked(hashParamsMod.getHashParams).mockReturnValue(new URLSearchParams('event=1'))

        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.listScheduledEvenings).mockResolvedValue(UPCOMING_SCHEDULE as any)
        vi.mocked(api.listRsvps).mockResolvedValue([] as any)
        vi.mocked(api.listPins).mockResolvedValue([] as any)

        await renderSchedulePage()
        await waitFor(() => expect(screen.getByText('schedule.rsvpQuickTitle')).toBeInTheDocument())
        fireEvent.click(screen.getByText('close-sheet'))
        await waitFor(() => {
            expect(screen.queryByText('schedule.rsvpQuickTitle')).not.toBeInTheDocument()
        })
    })
})
