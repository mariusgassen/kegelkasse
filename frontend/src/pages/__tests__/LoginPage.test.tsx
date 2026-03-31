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

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    useI18n: () => ({ locale: 'de', setLocale: vi.fn() }),
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
})
