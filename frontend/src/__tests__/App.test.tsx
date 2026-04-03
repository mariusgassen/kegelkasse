import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Polyfill IndexedDB for jsdom — App.tsx reads the missed-notifications store on mount
import 'fake-indexeddb/auto'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    useI18n: vi.fn(() => ({ locale: 'de', setLocale: vi.fn() })),
    t: (key: string) => key,
}))

vi.mock('@/components/Logo.tsx', () => ({
    AppLogoAnimated: ({ size }: { size?: number }) => (
        <svg data-testid="app-logo-animated" width={size} />
    ),
}))

vi.mock('@/components/ui/OfflineBanner.tsx', () => ({
    OfflineBanner: () => <div data-testid="offline-banner" />,
}))

vi.mock('@/components/ui/Toast.tsx', () => ({
    ToastContainer: () => <div data-testid="toast-container" />,
    showToast: vi.fn(),
}))

vi.mock('@/components/ProfileSheet.tsx', () => ({
    ProfileSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
        open ? <div data-testid="profile-sheet"><button onClick={onClose}>close-profile</button></div> : null,
}))

vi.mock('@/components/NotificationPanel.tsx', () => ({
    NotificationPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
        open ? <div data-testid="notification-panel"><button onClick={onClose}>close-notif</button></div> : null,
}))

vi.mock('@/pages/LoginPage.tsx', () => ({
    LoginPage: ({ onLogin }: { onLogin: () => void }) => (
        <div data-testid="login-page">
            <button onClick={onLogin}>login</button>
        </div>
    ),
}))

vi.mock('@/pages/EveningHubPage.tsx', () => ({
    EveningHubPage: ({ onNavigate, onHistory }: { onNavigate?: () => void; onHistory?: () => void }) => (
        <div data-testid="evening-hub-page">
            {onNavigate && <button onClick={onNavigate}>hub-navigate</button>}
            {onHistory && <button onClick={onHistory}>hub-history</button>}
        </div>
    ),
}))

vi.mock('@/pages/EveningPage.tsx', () => ({
    EveningPage: () => <div data-testid="evening-page" />,
}))

vi.mock('@/pages/TreasuryPage.tsx', () => ({
    TreasuryPage: () => <div data-testid="treasury-page" />,
}))

vi.mock('@/pages/StatsPage.tsx', () => ({
    StatsPage: () => <div data-testid="stats-page" />,
}))

vi.mock('@/pages/ClubAdminPage.tsx', () => ({
    ClubAdminPage: () => <div data-testid="club-admin-page" />,
}))

vi.mock('@/pages/SchedulePage.tsx', () => ({
    SchedulePage: ({ onNavigate }: { onNavigate?: () => void }) => (
        <div data-testid="schedule-page">
            {onNavigate && <button onClick={onNavigate}>schedule-navigate</button>}
        </div>
    ),
}))

vi.mock('@/pages/CommitteePage.tsx', () => ({
    CommitteePage: () => <div data-testid="committee-page" />,
}))

vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: vi.fn(() => ({
        evening: null,
        invalidate: vi.fn(),
        activeEveningId: null,
        isPending: false,
    })),
}))

vi.mock('@/hooks/usePage.ts', () => ({
    usePage: vi.fn(() => ['evening', vi.fn()]),
    clearAuthParams: vi.fn(),
}))

vi.mock('@/store/notifications.ts', () => ({
    useNotificationStore: vi.fn(() => ({
        notifications: [],
        addNotification: vi.fn(),
    })),
    unreadCount: vi.fn(() => 0),
}))

// Mutable store state so tests can inject a user
const storeState = {
    user: null as any,
    activeEveningId: null as any,
    setUser: vi.fn(),
    setPenaltyTypes: vi.fn(),
    setRegularMembers: vi.fn(),
    setGameTemplates: vi.fn(),
    setGuestPenaltyCap: vi.fn(),
    setActiveEveningId: vi.fn(),
}

vi.mock('@/store/app.ts', () => ({
    useAppStore: Object.assign(
        vi.fn((sel?: any) => (sel ? sel(storeState) : storeState)),
        { getState: () => storeState },
    ),
    isAdmin: vi.fn(() => false),
}))

// Mock authState so we can control isLoggedIn()
const mockAuthState = {
    isLoggedIn: vi.fn(() => false),
    setToken: vi.fn(),
    onUnauthorized: vi.fn(() => () => {}),
    getToken: vi.fn(() => null),
}

vi.mock('@/api/client.ts', () => ({
    authState: mockAuthState,
    NetworkError: class NetworkError extends Error {
        constructor() { super('network'); this.name = 'NetworkError' }
    },
    UnauthorizedError: class UnauthorizedError extends Error {
        constructor() { super('unauthorized'); this.name = 'UnauthorizedError' }
    },
    api: {
        me: vi.fn(),
        listPenaltyTypes: vi.fn().mockResolvedValue([]),
        listRegularMembers: vi.fn().mockResolvedValue([]),
        listGameTemplates: vi.fn().mockResolvedValue([]),
        getClub: vi.fn().mockResolvedValue({ id: 1, name: 'TestClub', slug: 'tc', settings: null }),
        listEvenings: vi.fn().mockResolvedValue([]),
        getRecentNotifications: vi.fn().mockResolvedValue([]),
    },
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
}

async function renderApp() {
    const App = (await import('../App')).default
    const qc = makeQueryClient()
    return render(
        <QueryClientProvider client={qc}>
            <App />
        </QueryClientProvider>
    )
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('App — loading splash', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        storeState.user = null
        // isLoggedIn=true means boot query runs, which keeps bootDone=false initially
        mockAuthState.isLoggedIn.mockReturnValue(true)
        // Make api.me never resolve so we stay in loading state
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.me).mockReturnValue(new Promise(() => {}))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows loading logo while booting', async () => {
        await renderApp()
        // The loading splash renders the animated logo
        expect(screen.getByTestId('app-logo-animated')).toBeInTheDocument()
        expect(screen.getByText('error.connecting')).toBeInTheDocument()
    })
})

describe('App — not authenticated (no token)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        // No token → bootDone starts true, skip boot query
        mockAuthState.isLoggedIn.mockReturnValue(false)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows LoginPage when not authenticated', async () => {
        await renderApp()
        await waitFor(() => {
            expect(screen.getByTestId('login-page')).toBeInTheDocument()
        })
    })

    it('does not show the nav when unauthenticated', async () => {
        await renderApp()
        await waitFor(() => {
            expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
        })
    })
})

describe('App — authenticated', () => {
    const mockUser = {
        id: 1,
        email: 'u@example.com',
        name: 'Rudi',
        username: null,
        role: 'member' as const,
        club_id: 1,
        preferred_locale: 'de',
        avatar: null,
        regular_member_id: null,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        storeState.user = mockUser
        storeState.activeEveningId = null
        // No token in storage → bootDone=true immediately; user already in store
        mockAuthState.isLoggedIn.mockReturnValue(false)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows navigation when user is in store', async () => {
        await renderApp()
        await waitFor(() => {
            expect(screen.getByRole('navigation')).toBeInTheDocument()
        })
    })

    it('shows notification bell', async () => {
        await renderApp()
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'notifications.title' })).toBeInTheDocument()
        })
    })

    it('shows club name in header', async () => {
        await renderApp()
        await waitFor(() => {
            expect(screen.getByText('app.name')).toBeInTheDocument()
        })
    })

    it('does not show LoginPage when authenticated', async () => {
        await renderApp()
        await waitFor(() => {
            expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
        })
    })

    it('shows nav tabs for non-admin user (no club tab)', async () => {
        await renderApp()
        await waitFor(() => {
            // The ⚙️ club tab should not appear for plain members
            expect(screen.queryByText('nav.club')).not.toBeInTheDocument()
        })
    })

    it('shows club tab for admin users', async () => {
        storeState.user = { ...mockUser, role: 'admin' }
        await renderApp()
        await waitFor(() => {
            expect(screen.getByText('nav.club')).toBeInTheDocument()
        })
    })
})

describe('App — network error on boot', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        mockAuthState.isLoggedIn.mockReturnValue(true)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows server-down screen when boot gets a NetworkError', async () => {
        const { api, NetworkError } = await import('@/api/client.ts')
        vi.mocked(api.me).mockRejectedValue(new NetworkError())

        await renderApp()

        await waitFor(() => {
            expect(screen.getByText('error.retry')).toBeInTheDocument()
        })
    })
})

// ── pure-function unit tests ──────────────────────────────────────────────────

describe('hexToHsl', () => {
    it('converts white to hsl(0, 0%, 100%)', async () => {
        const { hexToHsl } = await import('../App')
        const [h, s, l] = hexToHsl('#ffffff')
        expect(h).toBeCloseTo(0)
        expect(s).toBeCloseTo(0)
        expect(l).toBeCloseTo(100)
    })

    it('converts black to hsl(0, 0%, 0%)', async () => {
        const { hexToHsl } = await import('../App')
        const [h, s, l] = hexToHsl('#000000')
        expect(h).toBeCloseTo(0)
        expect(s).toBeCloseTo(0)
        expect(l).toBeCloseTo(0)
    })

    it('converts red to hsl(0, 100%, 50%)', async () => {
        const { hexToHsl } = await import('../App')
        const [h, s, l] = hexToHsl('#ff0000')
        expect(h).toBeCloseTo(0)
        expect(s).toBeCloseTo(100)
        expect(l).toBeCloseTo(50)
    })

    it('converts blue to hsl(240, 100%, 50%)', async () => {
        const { hexToHsl } = await import('../App')
        const [h, s, l] = hexToHsl('#0000ff')
        expect(h).toBeCloseTo(240)
        expect(s).toBeCloseTo(100)
        expect(l).toBeCloseTo(50)
    })
})

describe('applyClubTheme', () => {
    it('sets primary CSS variable when club has primary_color', async () => {
        const { applyClubTheme } = await import('../App')
        applyClubTheme({ settings: { primary_color: '#c47a1a', secondary_color: null, bg_color: null } })
        expect(document.documentElement.style.getPropertyValue('--kce-primary')).toBe('#c47a1a')
    })

    it('sets secondary CSS variable when club has secondary_color', async () => {
        const { applyClubTheme } = await import('../App')
        applyClubTheme({ settings: { primary_color: null, secondary_color: '#123456', bg_color: null } })
        expect(document.documentElement.style.getPropertyValue('--kce-secondary')).toBe('#123456')
    })

    it('sets bg and derived surface variables when bg_color is provided', async () => {
        const { applyClubTheme } = await import('../App')
        applyClubTheme({ settings: { primary_color: null, secondary_color: null, bg_color: '#1a1a2e' } })
        expect(document.documentElement.style.getPropertyValue('--kce-bg')).toBe('#1a1a2e')
        // Derived surface vars should also be set
        expect(document.documentElement.style.getPropertyValue('--kce-surface')).toBeTruthy()
        expect(document.documentElement.style.getPropertyValue('--kce-surface2')).toBeTruthy()
        expect(document.documentElement.style.getPropertyValue('--kce-border')).toBeTruthy()
    })

    it('does nothing when club is null', async () => {
        const { applyClubTheme } = await import('../App')
        // Should not throw
        expect(() => applyClubTheme(null)).not.toThrow()
    })

    it('does nothing when settings are null', async () => {
        const { applyClubTheme } = await import('../App')
        expect(() => applyClubTheme({ settings: null })).not.toThrow()
    })
})

// ── interaction / branch coverage ────────────────────────────────────────────

describe('App — authenticated interactions', () => {
    const mockUser = {
        id: 1,
        email: 'u@example.com',
        name: 'Rudi',
        username: null,
        role: 'member' as const,
        club_id: 1,
        preferred_locale: 'de',
        avatar: null,
        regular_member_id: null,
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        storeState.user = mockUser
        storeState.activeEveningId = null
        mockAuthState.isLoggedIn.mockReturnValue(false)
        const { usePage } = await import('@/hooks/usePage.ts')
        vi.mocked(usePage).mockReturnValue(['evening', vi.fn()] as any)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('opens ProfileSheet when avatar button is clicked', async () => {
        await renderApp()
        await waitFor(() => screen.getByRole('button', { name: 'Profil' }))
        fireEvent.click(screen.getByRole('button', { name: 'Profil' }))
        await waitFor(() => {
            expect(screen.getByTestId('profile-sheet')).toBeInTheDocument()
        })
    })

    it('opens NotificationPanel when bell button is clicked', async () => {
        await renderApp()
        await waitFor(() => screen.getByRole('button', { name: 'notifications.title' }))
        fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
        await waitFor(() => {
            expect(screen.getByTestId('notification-panel')).toBeInTheDocument()
        })
    })

    it('shows active evening button when activeEveningId is set', async () => {
        storeState.activeEveningId = 42
        await renderApp()
        await waitFor(() => {
            expect(screen.getByText(/evening\.active/)).toBeInTheDocument()
        })
    })

    it('navigates to config page when active evening button is clicked', async () => {
        storeState.activeEveningId = 42
        const setPageMock = vi.fn()
        const { usePage } = await import('@/hooks/usePage.ts')
        vi.mocked(usePage).mockReturnValue(['evening', setPageMock] as any)
        await renderApp()
        await waitFor(() => screen.getByText(/evening\.active/))
        fireEvent.click(screen.getByText(/evening\.active/))
        expect(setPageMock).toHaveBeenCalledWith('config')
    })

    it('navigates to another page when nav button is clicked', async () => {
        const setPageMock = vi.fn()
        const { usePage } = await import('@/hooks/usePage.ts')
        vi.mocked(usePage).mockReturnValue(['evening', setPageMock] as any)
        await renderApp()
        await waitFor(() => screen.getByText('nav.treasury'))
        fireEvent.click(screen.getByText('nav.treasury'))
        expect(setPageMock).toHaveBeenCalledWith('treasury')
    })

    it('shows club logo img when club has logo_url', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({
            id: 1, name: 'TestClub', slug: 'tc',
            settings: { logo_url: '/uploads/logo.png', primary_color: null, secondary_color: null, bg_color: null },
        } as any)
        await renderApp()
        await waitFor(() => {
            const img = document.querySelector('img[alt="TestClub"]')
            expect(img).toBeInTheDocument()
        })
    })

    it('shows notification badge when badgeCount > 0', async () => {
        const { unreadCount } = await import('@/store/notifications.ts')
        vi.mocked(unreadCount).mockReturnValue(3)
        await renderApp()
        await waitFor(() => {
            expect(screen.getByText('3')).toBeInTheDocument()
        })
    })

    it('shows 9+ badge when badgeCount > 9', async () => {
        const { unreadCount } = await import('@/store/notifications.ts')
        vi.mocked(unreadCount).mockReturnValue(12)
        await renderApp()
        await waitFor(() => {
            expect(screen.getByText('9+')).toBeInTheDocument()
        })
    })

    it('shows user avatar img when user has avatar', async () => {
        storeState.user = { ...mockUser, avatar: '/avatars/me.jpg' }
        await renderApp()
        await waitFor(() => {
            const img = document.querySelector('img[alt=""]')
            expect(img).toBeInTheDocument()
        })
    })

    it('closes ProfileSheet when onClose is called', async () => {
        await renderApp()
        await waitFor(() => screen.getByRole('button', { name: 'Profil' }))
        fireEvent.click(screen.getByRole('button', { name: 'Profil' }))
        await waitFor(() => screen.getByTestId('profile-sheet'))
        fireEvent.click(screen.getByText('close-profile'))
        await waitFor(() => {
            expect(screen.queryByTestId('profile-sheet')).not.toBeInTheDocument()
        })
    })

    it('closes NotificationPanel when onClose is called', async () => {
        await renderApp()
        await waitFor(() => screen.getByRole('button', { name: 'notifications.title' }))
        fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
        await waitFor(() => screen.getByTestId('notification-panel'))
        fireEvent.click(screen.getByText('close-notif'))
        await waitFor(() => {
            expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument()
        })
    })

    it('calls setPage(config) when EveningHubPage onNavigate fires', async () => {
        const setPageMock = vi.fn()
        const { usePage } = await import('@/hooks/usePage.ts')
        vi.mocked(usePage).mockReturnValue(['evening', setPageMock] as any)
        await renderApp()
        await waitFor(() => screen.getByText('hub-navigate'))
        fireEvent.click(screen.getByText('hub-navigate'))
        expect(setPageMock).toHaveBeenCalledWith('config')
    })

    it('calls setPage(schedule) when EveningHubPage onHistory fires', async () => {
        const setPageMock = vi.fn()
        const { usePage } = await import('@/hooks/usePage.ts')
        vi.mocked(usePage).mockReturnValue(['evening', setPageMock] as any)
        await renderApp()
        await waitFor(() => screen.getByText('hub-history'))
        fireEvent.click(screen.getByText('hub-history'))
        expect(setPageMock).toHaveBeenCalledWith('schedule')
    })

    it('calls setPage(evening) when SchedulePage onNavigate fires', async () => {
        const setPageMock = vi.fn()
        const { usePage } = await import('@/hooks/usePage.ts')
        vi.mocked(usePage).mockReturnValue(['schedule', setPageMock] as any)
        await renderApp()
        await waitFor(() => screen.getByText('schedule-navigate'))
        fireEvent.click(screen.getByText('schedule-navigate'))
        expect(setPageMock).toHaveBeenCalledWith('evening')
    })
})

describe('App — retry boot button', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        storeState.user = null
        mockAuthState.isLoggedIn.mockReturnValue(true)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('clicking retry button resets boot state and triggers refetch', async () => {
        const { api, NetworkError } = await import('@/api/client.ts')
        // First call: network error. Second call: success (resolve to null-like).
        vi.mocked(api.me)
            .mockRejectedValueOnce(new NetworkError())
            .mockReturnValue(new Promise(() => {})) // second call hangs (stays loading)
        await renderApp()
        // Wait for retry button to appear
        await waitFor(() => screen.getByText('error.retry'))
        fireEvent.click(screen.getByText('error.retry'))
        // After clicking, the loading splash should re-appear (bootDone=false)
        await waitFor(() => {
            expect(screen.getByText('error.connecting')).toBeInTheDocument()
        })
    })
})
