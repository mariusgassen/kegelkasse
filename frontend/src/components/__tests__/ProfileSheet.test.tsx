import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── browser API stubs ──────────────────────────────────────────────────────────

beforeAll(() => {
    // Vite build-time injected global
    vi.stubGlobal('__APP_VERSION__', '0.0.0-test')

    // jsdom doesn't implement matchMedia
    if (!window.matchMedia) {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        })
    }
})

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    useI18n: () => ({ locale: 'de', setLocale: vi.fn() }),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn(() => ({
        user: null,
        setUser: vi.fn(),
        regularMembers: [],
    })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getMyStats: vi.fn(),
        getMyBalance: vi.fn(),
        getClub: vi.fn(),
        getPushStatus: vi.fn(),
        getPushPreferences: vi.fn(),
        updatePushPreferences: vi.fn(),
        updateProfile: vi.fn(),
        uploadAvatar: vi.fn(),
        deleteAvatar: vi.fn(),
        updateAvatar: vi.fn(),
        deleteAccount: vi.fn(),
        createPaymentRequest: vi.fn(),
        getMyPaymentRequests: vi.fn(),
        updateLocale: vi.fn(),
        testPush: vi.fn(),
    },
    authState: {
        setToken: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_USER = {
    id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin User',
    username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const MEMBER_USER = {
    id: 2, role: 'member', email: 'member@test.de', name: 'Hans Schmidt',
    username: 'hans', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 5,
}

const MY_STATS = {
    year: 2026,
    evening_count: 8,
    penalty_total: 15.50,
    win_count: 3,
    drink_count: 6,
    president_count: 1,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderProfileSheet(props: { open?: boolean; onClose?: () => void } = {}) {
    const { ProfileSheet } = await import('../ProfileSheet')
    return render(
        <ProfileSheet open={props.open ?? true} onClose={props.onClose ?? vi.fn()} />,
        { wrapper: makeWrapper() }
    )
}

async function setupAsAdmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockReturnValue({
        user: ADMIN_USER,
        setUser: vi.fn(),
        regularMembers: [],
    } as any)
}

async function setupAsMember() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(false)
    vi.mocked(useAppStore).mockReturnValue({
        user: MEMBER_USER,
        setUser: vi.fn(),
        regularMembers: [],
    } as any)
}

async function setupApiMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
    vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
    vi.mocked(api.getPushPreferences).mockResolvedValue({
        kegeln: true, penalties: true, debt: true, comments: true,
    } as any)
    vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ProfileSheet — rendering when closed', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders nothing when open=false', async () => {
        await setupApiMocks()
        await renderProfileSheet({ open: false })
        // ProfileSheet is a full-screen overlay, when closed nothing should be visible
        expect(screen.queryByText('profile.title')).not.toBeInTheDocument()
    })
})

describe('ProfileSheet — basic display', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockReturnValue({
            user: MEMBER_USER, setUser: vi.fn(), regularMembers: [],
        } as any)
    })

    it('shows displayName field label', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByText('profile.displayName')).toBeInTheDocument()
    })

    it('shows logout button', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByText('auth.logout')).toBeInTheDocument()
    })

    it('shows language settings section', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByText('settings.language')).toBeInTheDocument()
    })
})

describe('ProfileSheet — admin user', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsAdmin()
    })

    it('shows admin user name', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument()
    })

    it('shows profile form with pre-filled email', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByDisplayValue('admin@test.de')).toBeInTheDocument()
    })

    it('shows reminder_payments toggle for admin', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.displayName')).toBeInTheDocument()
        })
    })
})

describe('ProfileSheet — member user', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows member user name in input', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByDisplayValue('Hans Schmidt')).toBeInTheDocument()
    })

    it('shows yearly stats section after loading', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.evenings')).toBeInTheDocument()
        })
    })

    it('shows logout button', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByText('auth.logout')).toBeInTheDocument()
    })
})

describe('ProfileSheet — language selector', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows language settings label', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        expect(screen.getByText('settings.language')).toBeInTheDocument()
    })

    it('shows version number in footer', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        // Footer shows version
        expect(screen.getByText(/0\.0\.0-test/)).toBeInTheDocument()
    })
})

describe('ProfileSheet — stats display', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows profile.penalties stat after myStats loads', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.penalties')).toBeInTheDocument()
        })
    })

    it('shows profile.wins stat after myStats loads', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.wins')).toBeInTheDocument()
        })
    })

    it('shows profile.beerRounds stat after myStats loads', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.beerRounds')).toBeInTheDocument()
        })
    })

    it('shows profile.myStats section header', async () => {
        await setupApiMocks()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText(/profile\.myStats/)).toBeInTheDocument()
        })
    })
})

describe('ProfileSheet — balance display', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows profile.myBalance section when balance loaded', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -5.00, penalty_total: 5.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({ kegeln: true, penalties: true, debt: true, comments: true } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.myBalance')).toBeInTheDocument()
        })
    })

    it('shows profile.balance label when balance loaded', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({ kegeln: true, penalties: true, debt: true, comments: true } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.balance')).toBeInTheDocument()
        })
    })

    it('shows PayPal payNow link when debt > 0 and paypalHandle configured', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -10.00, penalty_total: 10.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { paypal_me: 'testuser' } } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({ kegeln: true, penalties: true, debt: true, comments: true } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.payNow')).toBeInTheDocument()
        })
    })

    it('shows payment request list when myRequests has items', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -5.00, penalty_total: 5.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({ kegeln: true, penalties: true, debt: true, comments: true } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([
            { id: 1, amount: 5.00, status: 'pending', created_at: '2026-01-15T10:00:00Z' }
        ] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.paymentRequests')).toBeInTheDocument()
        })
    })

    it('shows payment request status label in list', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -5.00, penalty_total: 5.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({ kegeln: true, penalties: true, debt: true, comments: true } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([
            { id: 1, amount: 5.00, status: 'confirmed', created_at: '2026-01-15T10:00:00Z' }
        ] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('profile.paymentRequests')).toBeInTheDocument()
        })
        expect(screen.getByText('paymentRequest.confirmed')).toBeInTheDocument()
    })
})

describe('ProfileSheet — push preferences', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows push.preferences section when pushPrefs loaded', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({
            penalties: true, evenings: true, schedule: true, payments: true,
            games: true, members: true, comments: true,
            reminder_debt: false, reminder_schedule: false, reminder_payments: false,
        } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.preferences')).toBeInTheDocument()
        })
    })

    it('shows push.pref.penalties toggle', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({
            penalties: true, evenings: true, schedule: true, payments: true,
            games: true, members: true, comments: true,
            reminder_debt: false, reminder_schedule: false, reminder_payments: false,
        } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.penalties')).toBeInTheDocument()
        })
    })

    it('calls updatePushPreferences when toggle clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({
            penalties: true, evenings: true, schedule: true, payments: true,
            games: true, members: true, comments: true,
            reminder_debt: false, reminder_schedule: false, reminder_payments: false,
        } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.updatePushPreferences).mockResolvedValue({} as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.penalties')).toBeInTheDocument()
        })

        // Click the toggle button for 'penalties' — it's aria-pressed=true
        const toggles = screen.getAllByRole('button', { pressed: true })
        // Click the first non-disabled pressed toggle (skip the always-on committee toggle)
        const enabledToggle = toggles.find(b => !b.hasAttribute('disabled'))
        if (enabledToggle) {
            fireEvent.click(enabledToggle)
            await waitFor(() => {
                expect(api.updatePushPreferences).toHaveBeenCalled()
            })
        }
    })

    it('shows push.reminders section header', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({
            penalties: true, evenings: true, schedule: true, payments: true,
            games: true, members: true, comments: true,
            reminder_debt: false, reminder_schedule: false, reminder_payments: false,
        } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.reminders')).toBeInTheDocument()
        })
    })

    it('shows reminder_payments toggle for admin user', async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockReturnValue({
            user: { ...ADMIN_USER, regular_member_id: 1 }, setUser: vi.fn(), regularMembers: [],
        } as any)
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({
            penalties: true, evenings: true, schedule: true, payments: true,
            games: true, members: true, comments: true,
            reminder_debt: false, reminder_schedule: false, reminder_payments: false,
        } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_payments')).toBeInTheDocument()
        })
    })
})

describe('ProfileSheet — save profile', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('calls api.updateProfile when save clicked with changed name', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({} as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.updateProfile).mockResolvedValue({ ...MEMBER_USER, name: 'New Name' } as any)

        await renderProfileSheet()
        const nameInput = screen.getByDisplayValue('Hans Schmidt')
        fireEvent.change(nameInput, { target: { value: 'New Name' } })
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => {
            expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }))
        })
    })

    it('closes after save when nothing substantive changed', async () => {
        // Uses internal email so email field is empty → no payload changes → no API call
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockReturnValue({
            user: { ...MEMBER_USER, email: 'member@kegelkasse.internal' },
            setUser: vi.fn(),
            regularMembers: [],
        } as any)

        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({} as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        const onClose = vi.fn()
        await renderProfileSheet({ onClose })
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => {
            expect(onClose).toHaveBeenCalled()
        })
        expect(api.updateProfile).not.toHaveBeenCalled()
    })
})

describe('ProfileSheet — logout and account delete', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
        await setupApiMocks()
    })

    it('calls authState.setToken(null) on logout', async () => {
        const { authState } = await import('@/api/client.ts')
        await renderProfileSheet()
        fireEvent.click(screen.getByText('auth.logout'))
        expect(authState.setToken).toHaveBeenCalledWith(null)
    })

    it('shows deleteConfirm UI after clicking deleteAccount', async () => {
        await renderProfileSheet()
        fireEvent.click(screen.getByText('profile.deleteAccount'))
        expect(screen.getByText('profile.deleteConfirm')).toBeInTheDocument()
        expect(screen.getByText('action.confirmDelete')).toBeInTheDocument()
    })

    it('hides confirm UI when cancel clicked', async () => {
        await renderProfileSheet()
        fireEvent.click(screen.getByText('profile.deleteAccount'))
        expect(screen.getByText('profile.deleteConfirm')).toBeInTheDocument()
        // click the cancel button in the confirm box
        const cancelBtns = screen.getAllByText('action.cancel')
        fireEvent.click(cancelBtns[cancelBtns.length - 1])
        expect(screen.queryByText('profile.deleteConfirm')).not.toBeInTheDocument()
    })

    it('calls api.deleteAccount when confirmDelete clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteAccount).mockResolvedValue(undefined as any)
        await renderProfileSheet()
        fireEvent.click(screen.getByText('profile.deleteAccount'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deleteAccount).toHaveBeenCalled()
        })
    })
})

describe('ProfileSheet — payment form interaction', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows payment amount form when reportPayment clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -10.00, penalty_total: 10.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { paypal_me: 'testuser' } } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({} as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getAllByText('profile.reportPayment').length).toBeGreaterThan(0)
        })
        // Click the bottom "report payment" button (secondary button)
        const reportBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(reportBtns[reportBtns.length - 1])
        // Now should show an action.cancel button
        await waitFor(() => {
            expect(screen.getByText('action.cancel')).toBeInTheDocument()
        })
    })

    it('calls api.createPaymentRequest when payment form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -10.00, penalty_total: 10.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { paypal_me: 'testuser' } } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({} as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.createPaymentRequest).mockResolvedValue({ id: 1, amount: 10, status: 'pending' } as any)

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getAllByText('profile.reportPayment').length).toBeGreaterThan(0)
        })
        const reportBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(reportBtns[reportBtns.length - 1])

        await waitFor(() => {
            // Now the primary submit "profile.reportPayment" button inside the form
            expect(screen.getAllByText('profile.reportPayment').length).toBeGreaterThan(0)
        })
        // Click the primary submit button (first one in form)
        const submitBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(submitBtns[0])
        await waitFor(() => {
            expect(api.createPaymentRequest).toHaveBeenCalledWith({ amount: 10 })
        })
    })

    it('calls toastError when createPaymentRequest throws', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -10.00, penalty_total: 10.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { paypal_me: 'testuser' } } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({} as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.createPaymentRequest).mockRejectedValue(new Error('payment failed'))

        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getAllByText('profile.reportPayment').length).toBeGreaterThan(0)
        })
        // Open the payment form
        const reportBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(reportBtns[reportBtns.length - 1])

        await waitFor(() => {
            expect(screen.getByText('action.cancel')).toBeInTheDocument()
        })
        // Submit (uses default debtAmount)
        const submitBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(submitBtns[0])
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })
})

describe('ProfileSheet — language toggle', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
        await setupApiMocks()
    })

    it('calls api.updateLocale when language button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateLocale).mockResolvedValue(undefined as any)

        await renderProfileSheet()
        // Click the EN language button
        const enBtn = screen.getByText('EN')
        fireEvent.click(enBtn)
        // updateLocale is called with the new locale (fire-and-forget)
        await waitFor(() => {
            expect(api.updateLocale).toHaveBeenCalledWith('en')
        })
    })

    it('calls api.updateLocale with de when DE button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateLocale).mockResolvedValue(undefined as any)

        await renderProfileSheet()
        const deBtn = screen.getByText('DE')
        fireEvent.click(deBtn)
        await waitFor(() => {
            expect(api.updateLocale).toHaveBeenCalledWith('de')
        })
    })
})

describe('ProfileSheet — reminder toggles', () => {
    async function setupWithReminders(extraPrefs = {}) {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: 0, penalty_total: 0, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({
            penalties: true, evenings: true, schedule: true, payments: true,
            games: true, members: true, comments: true,
            reminder_debt: false, reminder_schedule: false, reminder_payments: false,
            reminder_schedule_days: 5,
            ...extraPrefs,
        } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.updatePushPreferences).mockResolvedValue({} as any)
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    it('shows push.pref.reminder_debt toggle', async () => {
        await setupWithReminders()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_debt')).toBeInTheDocument()
        })
    })

    it('calls updatePushPreferences when reminder_debt toggle clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await setupWithReminders({ reminder_debt: false })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_debt')).toBeInTheDocument()
        })
        // Find the toggle button next to reminder_debt label — it's aria-pressed=false (reminder_debt is false)
        const debtLabel = screen.getByText('push.pref.reminder_debt')
        // The toggle button is in the same row
        const row = debtLabel.closest('div')!
        const toggle = row.querySelector('button[aria-pressed]') as HTMLButtonElement
        fireEvent.click(toggle)
        await waitFor(() => {
            expect(api.updatePushPreferences).toHaveBeenCalledWith(expect.objectContaining({ reminder_debt: true }))
        })
    })

    it('shows push.pref.reminder_schedule toggle', async () => {
        await setupWithReminders()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_schedule')).toBeInTheDocument()
        })
    })

    it('calls updatePushPreferences when reminder_schedule toggle clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await setupWithReminders({ reminder_schedule: false })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_schedule')).toBeInTheDocument()
        })
        const schedLabel = screen.getByText('push.pref.reminder_schedule')
        const row = schedLabel.closest('div')!
        const toggle = row.querySelector('button[aria-pressed]') as HTMLButtonElement
        fireEvent.click(toggle)
        await waitFor(() => {
            expect(api.updatePushPreferences).toHaveBeenCalledWith(expect.objectContaining({ reminder_schedule: true }))
        })
    })

    it('shows reminder_schedule_days input when reminder_schedule is true', async () => {
        await setupWithReminders({ reminder_schedule: true, reminder_schedule_days: 5 })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.reminder_schedule_days')).toBeInTheDocument()
        })
        const input = screen.getByDisplayValue('5')
        expect(input).toBeInTheDocument()
    })

    it('calls updatePushPreferences when reminder_schedule_days input changed', async () => {
        const { api } = await import('@/api/client.ts')
        await setupWithReminders({ reminder_schedule: true, reminder_schedule_days: 5 })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByDisplayValue('5')).toBeInTheDocument()
        })
        const daysInput = screen.getByDisplayValue('5')
        fireEvent.change(daysInput, { target: { value: '7' } })
        await waitFor(() => {
            expect(api.updatePushPreferences).toHaveBeenCalledWith(expect.objectContaining({ reminder_schedule_days: 7 }))
        })
    })

    it('does not call updatePushPreferences for invalid days input (0 or NaN)', async () => {
        const { api } = await import('@/api/client.ts')
        await setupWithReminders({ reminder_schedule: true, reminder_schedule_days: 5 })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByDisplayValue('5')).toBeInTheDocument()
        })
        const daysInput = screen.getByDisplayValue('5')
        fireEvent.change(daysInput, { target: { value: '0' } })
        // Should not call API for 0
        await new Promise(r => setTimeout(r, 50))
        expect(api.updatePushPreferences).not.toHaveBeenCalled()
    })

    it('shows test push button when pushPrefs loaded', async () => {
        await setupWithReminders()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.testLabel')).toBeInTheDocument()
        })
        expect(screen.getByText('Test')).toBeInTheDocument()
    })

    it('calls api.testPush and shows toast when test button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        const { showToast } = await import('@/components/ui/Toast.tsx')
        vi.mocked(api.testPush).mockResolvedValue(undefined as any)
        await setupWithReminders()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('Test')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByText('Test'))
        await waitFor(() => {
            expect(api.testPush).toHaveBeenCalled()
        })
        expect(showToast).toHaveBeenCalledWith('push.testSent')
    })

    it('calls toastError when testPush throws', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.testPush).mockRejectedValue(new Error('push failed'))
        await setupWithReminders()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('Test')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByText('Test'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })

    it('shows reminder_payments toggle for admin user', async () => {
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, setUser: vi.fn(), regularMembers: [],
        } as any)
        await setupWithReminders({ reminder_payments: false })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_payments')).toBeInTheDocument()
        })
    })

    it('calls updatePushPreferences for reminder_payments when admin toggle clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.clearAllMocks()
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockReturnValue({
            user: ADMIN_USER, setUser: vi.fn(), regularMembers: [],
        } as any)
        await setupWithReminders({ reminder_payments: false })
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByText('push.pref.reminder_payments')).toBeInTheDocument()
        })
        const paymentsLabel = screen.getByText('push.pref.reminder_payments')
        const row = paymentsLabel.closest('div')!
        const toggle = row.querySelector('button[aria-pressed]') as HTMLButtonElement
        fireEvent.click(toggle)
        await waitFor(() => {
            expect(api.updatePushPreferences).toHaveBeenCalledWith(expect.objectContaining({ reminder_payments: true }))
        })
    })

    it('calls toastError when updatePushPreferences throws in reminder_schedule_days onChange', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.updatePushPreferences).mockRejectedValue(new Error('server error'))
        await setupWithReminders({ reminder_schedule: true, reminder_schedule_days: 5 })
        // Re-mock getPushPreferences to ensure prefs after the failed update are reverted
        vi.mocked(api.updatePushPreferences).mockRejectedValue(new Error('server error'))
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getByDisplayValue('5')).toBeInTheDocument()
        })
        const daysInput = screen.getByDisplayValue('5')
        fireEvent.change(daysInput, { target: { value: '10' } })
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })
})

describe('ProfileSheet — payment form cancel and amount input', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        await setupAsMember()
    })

    async function setupPaymentForm() {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMyStats).mockResolvedValue(MY_STATS as any)
        vi.mocked(api.getMyBalance).mockResolvedValue({ balance: -10.00, penalty_total: 10.00, payments_total: 0 } as any)
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { paypal_me: 'testuser' } } as any)
        vi.mocked(api.getPushStatus).mockResolvedValue({ configured: false } as any)
        vi.mocked(api.getPushPreferences).mockResolvedValue({} as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
    }

    it('cancels payment form when cancel button clicked in payment form', async () => {
        await setupPaymentForm()
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getAllByText('profile.reportPayment').length).toBeGreaterThan(0)
        })
        // Open the form
        const reportBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(reportBtns[reportBtns.length - 1])
        await waitFor(() => {
            expect(screen.getByText('action.cancel')).toBeInTheDocument()
        })
        // Cancel — hides form and shows payNow link again
        fireEvent.click(screen.getByText('action.cancel'))
        await waitFor(() => {
            expect(screen.getByText('profile.payNow')).toBeInTheDocument()
        })
    })

    it('accepts typed amount in payment amount input', async () => {
        await setupPaymentForm()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createPaymentRequest).mockResolvedValue({ id: 1, amount: 7.5, status: 'pending' } as any)
        await renderProfileSheet()
        await waitFor(() => {
            expect(screen.getAllByText('profile.reportPayment').length).toBeGreaterThan(0)
        })
        // Open form
        const reportBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(reportBtns[reportBtns.length - 1])
        await waitFor(() => {
            expect(screen.getByText('action.cancel')).toBeInTheDocument()
        })
        // Type custom amount
        const amountInput = screen.getByPlaceholderText('10.00')
        fireEvent.change(amountInput, { target: { value: '7,50' } })
        // Submit with custom amount
        const submitBtns = screen.getAllByText('profile.reportPayment')
        fireEvent.click(submitBtns[0])
        await waitFor(() => {
            expect(api.createPaymentRequest).toHaveBeenCalledWith({ amount: 7.5 })
        })
    })
})
