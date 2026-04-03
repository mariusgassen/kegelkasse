import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/api/client.ts', () => ({
    api: {
        login: vi.fn(),
        getInviteInfo: vi.fn(),
        register: vi.fn(),
        resetPassword: vi.fn(),
    },
    authState: {
        setToken: vi.fn(),
    },
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({ setUser: vi.fn() })),
}))

const mockSetLocale = vi.fn()

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    useI18n: () => ({ locale: 'de', setLocale: mockSetLocale }),
}))

vi.mock('@/components/Logo.tsx', () => ({
    AppLogo: ({ size }: { size?: number }) => <svg data-testid="app-logo" width={size} />,
}))

vi.mock('@/hooks/usePage.ts', () => ({
    clearAuthParams: vi.fn(),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

async function renderLoginPage(props = {}) {
    const { LoginPage } = await import('../LoginPage')
    return render(<LoginPage {...props} />)
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage — login mode', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        window.location.search = ''
    })

    it('renders login form by default', async () => {
        await renderLoginPage()
        expect(screen.getByText('auth.login')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('auth.emailPlaceholder')).toBeInTheDocument()
    })

    it('renders logo', async () => {
        await renderLoginPage()
        expect(screen.getByTestId('app-logo')).toBeInTheDocument()
    })

    it('renders language toggle buttons', async () => {
        await renderLoginPage()
        expect(screen.getByText('DE')).toBeInTheDocument()
        expect(screen.getByText('EN')).toBeInTheDocument()
    })

    it('shows error when login fails', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'))
        await renderLoginPage()

        fireEvent.change(screen.getByPlaceholderText('auth.emailPlaceholder'), {
            target: { value: 'user@example.com' },
        })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), {
            target: { value: 'wrongpass' },
        })
        fireEvent.submit(screen.getByText('auth.loginButton').closest('form')!)

        await waitFor(() => {
            expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
        })
    })

    it('calls onLogin callback on successful login', async () => {
        const { api, authState } = await import('@/api/client.ts')
        const { useAppStore } = await import('@/store/app.ts')
        const setUser = vi.fn()
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ setUser }))
        vi.mocked(api.login).mockResolvedValueOnce({
            access_token: 'tok-123',
            user: { id: 1, email: 'u@e.de', name: 'U', username: null, role: 'member', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: null },
        })
        const onLogin = vi.fn()
        await renderLoginPage({ onLogin })

        fireEvent.change(screen.getByPlaceholderText('auth.emailPlaceholder'), {
            target: { value: 'u@e.de' },
        })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), {
            target: { value: 'password' },
        })
        fireEvent.submit(screen.getByText('auth.loginButton').closest('form')!)

        await waitFor(() => {
            expect(authState.setToken).toHaveBeenCalledWith('tok-123')
            expect(onLogin).toHaveBeenCalledOnce()
        })
    })

    it('switches to register mode when invite link is clicked', async () => {
        await renderLoginPage()
        fireEvent.click(screen.getByText('auth.clickHere'))
        await waitFor(() => {
            expect(screen.getByText('auth.register.title')).toBeInTheDocument()
        })
    })
})

describe('LoginPage — register mode', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('shows register form when switching mode', async () => {
        await renderLoginPage()
        fireEvent.click(screen.getByText('auth.clickHere'))
        await waitFor(() => {
            expect(screen.getByText('auth.register.button')).toBeInTheDocument()
        })
    })

    it('shows error when registration fails', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.register).mockRejectedValueOnce(new Error('Token invalid'))
        await renderLoginPage()

        fireEvent.click(screen.getByText('auth.clickHere'))
        await waitFor(() => screen.getByText('auth.register.button'))

        fireEvent.submit(screen.getByText('auth.register.button').closest('form')!)

        await waitFor(() => {
            expect(screen.getByText('Token invalid')).toBeInTheDocument()
        })
    })

    it('can switch back to login mode', async () => {
        await renderLoginPage()
        fireEvent.click(screen.getByText('auth.clickHere'))
        await waitFor(() => screen.getByText('auth.register.button'))

        fireEvent.click(screen.getByText('← auth.login'))
        await waitFor(() => {
            expect(screen.getByText('auth.loginButton')).toBeInTheDocument()
        })
    })
})

describe('LoginPage — reset mode (via URL param)', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('shows reset form when reset param in search', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?reset=mytoken', hash: '', pathname: '/' },
            configurable: true,
        })
        await renderLoginPage()
        await waitFor(() => {
            expect(screen.getByText('auth.reset.title')).toBeInTheDocument()
        })
    })

    it('shows success message after reset', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?reset=mytoken', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.resetPassword).mockResolvedValueOnce(undefined as any)
        await renderLoginPage()

        await waitFor(() => screen.getByText('auth.reset.button'))
        fireEvent.submit(screen.getByText('auth.reset.button').closest('form')!)

        await waitFor(() => {
            expect(screen.getByText('auth.reset.success')).toBeInTheDocument()
        })
    })

    it('shows error when reset fails', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?reset=badtoken', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.resetPassword).mockRejectedValueOnce(new Error('Token expired'))
        await renderLoginPage()

        await waitFor(() => screen.getByText('auth.reset.button'))
        fireEvent.submit(screen.getByText('auth.reset.button').closest('form')!)

        await waitFor(() => {
            expect(screen.getByText('Token expired')).toBeInTheDocument()
        })
    })

    it('can navigate back to login from reset success screen', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?reset=mytoken', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.resetPassword).mockResolvedValueOnce(undefined as any)
        await renderLoginPage()

        await waitFor(() => screen.getByText('auth.reset.button'))
        fireEvent.submit(screen.getByText('auth.reset.button').closest('form')!)

        await waitFor(() => screen.getByText('auth.reset.success'))
        // Click the login button shown after success
        fireEvent.click(screen.getByText('auth.login'))

        await waitFor(() => {
            expect(screen.getByText('auth.loginButton')).toBeInTheDocument()
        })
    })

    it('can navigate back to login from reset form', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?reset=mytoken', hash: '', pathname: '/' },
            configurable: true,
        })
        await renderLoginPage()
        await waitFor(() => screen.getByText('auth.reset.title'))
        // The back button text is "← auth.login"
        fireEvent.click(screen.getByText(/← auth\.login/))
        await waitFor(() => {
            expect(screen.getByText('auth.loginButton')).toBeInTheDocument()
        })
    })
})

describe('LoginPage — register success', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        Object.defineProperty(window, 'location', {
            value: { search: '', hash: '', pathname: '/' },
            configurable: true,
        })
    })

    it('calls api.register, sets token and user, calls onLogin on success', async () => {
        const { api, authState } = await import('@/api/client.ts')
        const { useAppStore } = await import('@/store/app.ts')
        const setUser = vi.fn()
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ setUser }))
        vi.mocked(api.register).mockResolvedValueOnce({
            access_token: 'reg-tok',
            user: { id: 2, email: 'new@e.de', name: 'New', username: 'newbie', role: 'member', club_id: 1, preferred_locale: null, avatar: null, regular_member_id: null },
        })
        const onLogin = vi.fn()
        await renderLoginPage({ onLogin })

        // Switch to register mode
        fireEvent.click(screen.getByText('auth.clickHere'))
        await waitFor(() => screen.getByText('auth.register.button'))

        // Fill in the form fields
        fireEvent.change(screen.getByPlaceholderText('auth.invite.tokenPlaceholder'), {
            target: { value: 'tok-abc' },
        })
        fireEvent.change(screen.getByPlaceholderText('auth.namePlaceholder'), {
            target: { value: 'My Name' },
        })
        fireEvent.change(screen.getByPlaceholderText('auth.usernamePlaceholder'), {
            target: { value: 'myuser' },
        })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), {
            target: { value: 'securepass' },
        })
        fireEvent.submit(screen.getByText('auth.register.button').closest('form')!)

        await waitFor(() => {
            expect(authState.setToken).toHaveBeenCalledWith('reg-tok')
            expect(setUser).toHaveBeenCalled()
            expect(onLogin).toHaveBeenCalled()
        })
    })

    it('shows generic error when registration fails without message', async () => {
        const { api } = await import('@/api/client.ts')
        // Throw a non-Error object
        vi.mocked(api.register).mockRejectedValueOnce('unknown error')
        await renderLoginPage()

        fireEvent.click(screen.getByText('auth.clickHere'))
        await waitFor(() => screen.getByText('auth.register.button'))

        fireEvent.submit(screen.getByText('auth.register.button').closest('form')!)
        await waitFor(() => {
            expect(screen.getByText('error.generic')).toBeInTheDocument()
        })
    })
})

describe('LoginPage — register mode with invite token in URL', () => {
    afterEach(() => {
        vi.resetAllMocks()
        Object.defineProperty(window, 'location', {
            value: { search: '', hash: '', pathname: '/' },
            configurable: true,
        })
    })

    it('auto-fills invite token from URL and shows register mode', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?token=invite-xyz', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getInviteInfo).mockResolvedValueOnce({ member_name: null } as any)
        await renderLoginPage()
        await waitFor(() => {
            expect(screen.getByText('auth.register.title')).toBeInTheDocument()
        })
    })

    it('shows welcome message when invite has a member_name', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?token=invite-abc', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getInviteInfo).mockResolvedValueOnce({ member_name: 'Klaus' } as any)
        await renderLoginPage()
        await waitFor(() => {
            expect(screen.getByText(/Klaus/)).toBeInTheDocument()
            // The welcome paragraph is split across nodes — look for the container text
            expect(document.body.textContent).toContain('auth.register.welcome')
        })
    })

    it('hides token and name fields when prefilledName is set', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?token=invite-abc', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getInviteInfo).mockResolvedValueOnce({ member_name: 'Klaus' } as any)
        await renderLoginPage()
        await waitFor(() => screen.getByText(/Klaus/))
        // Token and name inputs should not be visible when prefilledName is set
        expect(screen.queryByPlaceholderText('auth.invite.tokenPlaceholder')).not.toBeInTheDocument()
        expect(screen.queryByPlaceholderText('auth.namePlaceholder')).not.toBeInTheDocument()
    })

    it('shows token and name fields when no prefilledName', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?token=invite-abc', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api } = await import('@/api/client.ts')
        // No member_name → prefilledName stays null
        vi.mocked(api.getInviteInfo).mockResolvedValueOnce({ member_name: null } as any)
        await renderLoginPage()
        await waitFor(() => screen.getByText('auth.register.title'))
        // Wait for getInviteInfo to settle (no member_name → fields remain visible)
        await waitFor(() => {
            expect(screen.getByPlaceholderText('auth.invite.tokenPlaceholder')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('auth.namePlaceholder')).toBeInTheDocument()
        })
    })

    it('registers successfully with prefilledName (no name field sent)', async () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?token=invite-pf', hash: '', pathname: '/' },
            configurable: true,
        })
        const { api, authState } = await import('@/api/client.ts')
        const { useAppStore } = await import('@/store/app.ts')
        const setUser = vi.fn()
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ setUser }))
        vi.mocked(api.getInviteInfo).mockResolvedValueOnce({ member_name: 'Franz' } as any)
        vi.mocked(api.register).mockResolvedValueOnce({
            access_token: 'tok-pf',
            user: { id: 3, email: 'f@e.de', name: 'Franz', username: 'franz', role: 'member', club_id: 1, preferred_locale: null, avatar: null, regular_member_id: null },
        })
        const onLogin = vi.fn()
        await renderLoginPage({ onLogin })

        await waitFor(() => screen.getByText(/Franz/))

        // Only username and password fields visible
        fireEvent.change(screen.getByPlaceholderText('auth.usernamePlaceholder'), {
            target: { value: 'franz99' },
        })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), {
            target: { value: 'pass123' },
        })
        fireEvent.submit(screen.getByText('auth.register.button').closest('form')!)

        await waitFor(() => {
            expect(authState.setToken).toHaveBeenCalledWith('tok-pf')
            expect(onLogin).toHaveBeenCalled()
        })
        // name should be undefined when prefilledName is set
        expect(api.register).toHaveBeenCalledWith(
            'invite-pf', 'pass123', 'franz99', undefined
        )
    })
})

describe('LoginPage — login with preferred_locale', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        mockSetLocale.mockReset()
        Object.defineProperty(window, 'location', {
            value: { search: '', hash: '', pathname: '/' },
            configurable: true,
        })
    })

    it('sets locale when user has preferred_locale', async () => {
        const { api, authState } = await import('@/api/client.ts')
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ setUser: vi.fn() }))
        vi.mocked(api.login).mockResolvedValueOnce({
            access_token: 'tok-en',
            user: { id: 1, email: 'u@e.de', name: 'U', username: null, role: 'member', club_id: 1, preferred_locale: 'en', avatar: null, regular_member_id: null },
        })
        await renderLoginPage()
        fireEvent.change(screen.getByPlaceholderText('auth.emailPlaceholder'), { target: { value: 'u@e.de' } })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass' } })
        fireEvent.submit(screen.getByText('auth.loginButton').closest('form')!)
        await waitFor(() => {
            expect(authState.setToken).toHaveBeenCalledWith('tok-en')
            expect(mockSetLocale).toHaveBeenCalledWith('en')
        })
    })

    it('shows generic error when login fails without Error instance', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.login).mockRejectedValueOnce('bad string error')
        await renderLoginPage()
        fireEvent.change(screen.getByPlaceholderText('auth.emailPlaceholder'), { target: { value: 'x@x.de' } })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pw' } })
        fireEvent.submit(screen.getByText('auth.loginButton').closest('form')!)
        await waitFor(() => {
            expect(screen.getByText('auth.error.invalid')).toBeInTheDocument()
        })
    })
})

describe('LoginPage — language toggle', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        mockSetLocale.mockReset()
        Object.defineProperty(window, 'location', {
            value: { search: '', hash: '', pathname: '/' },
            configurable: true,
        })
    })

    it('calls setLocale when language button is clicked', async () => {
        await renderLoginPage()
        fireEvent.click(screen.getByText('EN'))
        expect(mockSetLocale).toHaveBeenCalledWith('en')
    })
})
