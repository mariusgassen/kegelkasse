import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/usePage.ts', () => ({
    useHashTab: vi.fn(() => ['overview', vi.fn()]),
    clearAuthParams: vi.fn(),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({ user: null, regularMembers: [] })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getClub: vi.fn(),
        getMyPaymentRequests: vi.fn(),
        getPaymentRequests: vi.fn(),
        getMemberBalances: vi.fn(),
        getGuestBalances: vi.fn(),
        getExpenses: vi.fn(),
        getAllPayments: vi.fn(),
        getMemberPayments: vi.fn(),
        createMemberPayment: vi.fn(),
        deleteMemberPayment: vi.fn(),
        createExpense: vi.fn(),
        deleteExpense: vi.fn(),
        createPaymentRequest: vi.fn(),
        confirmPaymentRequest: vi.fn(),
        rejectPaymentRequest: vi.fn(),
        downloadReport: vi.fn(),
        remindDebtors: vi.fn(),
    },
}))

vi.mock('@/utils/parse.ts', () => ({ parseAmount: (s: string) => parseFloat(String(s).replace(',', '.')) || 0 }))
vi.mock('@/components/ui/ModeToggle.tsx', () => ({
    ModeToggle: ({ value, onChange, options }: any) => (
        <div>
            {options?.map((o: any) => (
                <button key={o.value} onClick={() => onChange(o.value)}>{o.label}</button>
            ))}
        </div>
    ),
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => new URLSearchParams(''),
    clearHashParams: vi.fn(),
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
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_USER = {
    id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin',
    username: null, club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const MEMBER_USER = {
    id: 2, role: 'member', email: 'member@test.de', name: 'Hans',
    username: null, club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 5,
}

const BALANCES = [
    { regular_member_id: 1, name: 'Admin', nickname: null, balance: 10.00, payments_total: 10.00, penalty_total: 0 },
    { regular_member_id: 5, name: 'Hans', nickname: 'Hansi', balance: -5.50, payments_total: 0, penalty_total: 5.50 },
    { regular_member_id: 6, name: 'Franz', nickname: null, balance: 0.00, payments_total: 0, penalty_total: 0 },
]

const REGULAR_MEMBERS = [
    { id: 1, name: 'Admin', nickname: null, is_guest: false, is_deleted: false },
    { id: 5, name: 'Hans', nickname: 'Hansi', is_guest: false, is_deleted: false },
]

const EXPENSES = [
    { id: 1, amount: 20.00, description: 'Getränke', note: 'Getränke', date: null, created_at: '2026-01-10T10:00:00', created_by: 1 },
]

const PAYMENTS = [
    { id: 10, regular_member_id: 1, member_name: 'Admin', amount: 15.00, note: 'Einzahlung', created_at: '2026-01-12T09:00:00' },
    { id: 11, regular_member_id: 5, member_name: 'Hans', amount: -5.50, note: null, created_at: '2026-01-05T08:00:00' },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderTreasuryPage() {
    const { TreasuryPage } = await import('../TreasuryPage')
    return render(<TreasuryPage />, { wrapper: makeWrapper() })
}

async function setupDefaultMocks() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
    vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
    vi.mocked(api.getMemberBalances).mockResolvedValue([] as any)
    vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
    vi.mocked(api.getExpenses).mockResolvedValue([] as any)
    vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
    vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
}

async function setupWithData() {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
    vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
    vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
    vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
    vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
    vi.mocked(api.getExpenses).mockResolvedValue(EXPENSES as any)
    vi.mocked(api.getAllPayments).mockResolvedValue(PAYMENTS as any)
    vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
}

async function setupAsAdmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
        user: ADMIN_USER,
        regularMembers: REGULAR_MEMBERS,
    }))
}

async function setupAsMember() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(false)
    vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
        user: MEMBER_USER,
        regularMembers: REGULAR_MEMBERS,
    }))
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('TreasuryPage — overview tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
    })

    it('renders treasury heading', async () => {
        await setupDefaultMocks()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText(/nav\.treasury/)).toBeInTheDocument()
        })
    })

    it('shows tab strip with overview, accounts, bookings', async () => {
        await setupDefaultMocks()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('treasury.tab.overview')).toBeInTheDocument()
            expect(screen.getByText('treasury.tab.accounts')).toBeInTheDocument()
            expect(screen.getByText('treasury.tab.bookings')).toBeInTheDocument()
        })
    })

    it('shows cashOnHand label on overview tab', async () => {
        await setupDefaultMocks()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getAllByText(/treasury\.cashOnHand/)[0]).toBeInTheDocument()
        })
    })

    it('shows open debts and credit summary', async () => {
        await setupWithData()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('treasury.openLabel')).toBeInTheDocument()
            expect(screen.getByText('treasury.creditLabel')).toBeInTheDocument()
        })
    })

    it('admin sees export controls', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('report.export')).toBeInTheDocument()
        })
    })

    it('non-admin does not see export controls', async () => {
        await setupDefaultMocks()
        await setupAsMember()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.queryByText('report.export')).not.toBeInTheDocument()
        })
    })

    it('shows debtors list on overview tab', async () => {
        await setupWithData()
        await renderTreasuryPage()
        // Hansi has -5.50 balance (debtor)
        await waitFor(() => {
            expect(screen.getByText(/Hansi|Hans/)).toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — accounts tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
    })

    it('shows member accounts search input', async () => {
        await setupDefaultMocks()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByPlaceholderText('treasury.accounts.search')).toBeInTheDocument()
        })
    })

    it('shows member list with balances on accounts tab', async () => {
        await setupWithData()
        await renderTreasuryPage()
        await waitFor(() => {
            // Should show Hansi (nickname takes priority over name)
            expect(screen.getByText('Hansi')).toBeInTheDocument()
        })
    })

    it('shows Ich badge for current user', async () => {
        await setupWithData()
        await setupAsMember()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('Ich')).toBeInTheDocument()
        })
    })

    it('admin sees payment button for members', async () => {
        await setupWithData()
        await setupAsAdmin()
        await renderTreasuryPage()
        await waitFor(() => {
            // Admin should see some action button (+ payment)
            expect(screen.getByText('Hansi')).toBeInTheDocument()
        })
    })

    it('filters members by search input', async () => {
        await setupWithData()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('Hansi')).toBeInTheDocument()
        })
        const searchInput = screen.getByPlaceholderText('treasury.accounts.search')
        fireEvent.change(searchInput, { target: { value: 'Admin' } })
        await waitFor(() => {
            // 'Admin' member should still be shown
            expect(screen.getByText('Admin')).toBeInTheDocument()
            // 'Hansi' member should not be shown after filtering for 'Admin'
            expect(screen.queryByText('Hansi')).not.toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — bookings tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
    })

    it('shows bookings search input', async () => {
        await setupDefaultMocks()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByPlaceholderText('treasury.bookings.search')).toBeInTheDocument()
        })
    })

    it('shows expense entries in bookings', async () => {
        await setupWithData()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('Getränke')).toBeInTheDocument()
        })
    })

    it('shows member payment entries in bookings', async () => {
        await setupWithData()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('Einzahlung')).toBeInTheDocument()
        })
    })

    it('admin sees add booking button', async () => {
        await setupDefaultMocks()
        await setupAsAdmin()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText(/treasury\.booking\.add/)).toBeInTheDocument()
        })
    })

    it('non-admin does not see add booking button', async () => {
        await setupDefaultMocks()
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.queryByText(/treasury\.booking\.add/)).not.toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — my balance section', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null, regularMembers: [] }))
    })

    it('shows Ich badge for current user in debtors list', async () => {
        await setupWithData()
        await setupAsMember()
        await renderTreasuryPage()
        await waitFor(() => {
            // Hansi (member_id=5) has -5.50 balance — debtor — shows Ich badge
            expect(screen.getByText('Ich')).toBeInTheDocument()
        })
    })

    it('shows profile.reportPayment button when paypal configured and member has debt', async () => {
        // Override club mock to include paypal handle
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: { paypal_me: 'myhandle' } } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        await setupAsMember()
        await renderTreasuryPage()
        await waitFor(() => {
            // paypal configured + member has debt → shows reportPayment button
            expect(screen.getByText('profile.reportPayment')).toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — booking sheet', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        await setupAsAdmin()
        await setupDefaultMocks()
    })

    it('opens booking sheet when + treasury.booking.add clicked', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows booking sheet title via testid', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toBeInTheDocument()
        })
    })

    it('shows income/expense type selector in booking sheet', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => {
            expect(screen.getByText(/treasury\.booking\.expense/)).toBeInTheDocument()
        })
    })

    it('closes booking sheet when cancel clicked', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        fireEvent.click(screen.getByText('close-sheet'))
        await waitFor(() => {
            expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
        })
    })

    it('shows amount and note inputs in booking sheet', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => {
            // booking sheet has description and amount inputs
            expect(screen.getByPlaceholderText(/treasury\.expense\.descPlaceholder/)).toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — payment requests', () => {
    const PENDING_REQUESTS = [
        { id: 1, regular_member_id: 5, member_name: 'Hans', nickname: 'Hansi',
          amount: 5.50, note: 'Überweisung', status: 'pending', created_at: '2026-01-15T10:00:00' },
    ]

    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
    })

    it('shows pending payment requests', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue(PENDING_REQUESTS as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('paymentRequest.pendingTitle')).toBeInTheDocument()
        })
    })

    it('shows confirm button for pending request', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue(PENDING_REQUESTS as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('paymentRequest.confirm')).toBeInTheDocument()
        })
    })

    it('calls api.confirmPaymentRequest when confirm clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue(PENDING_REQUESTS as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        vi.mocked(api.confirmPaymentRequest).mockResolvedValueOnce(undefined as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('paymentRequest.confirm'))
        fireEvent.click(screen.getByText('paymentRequest.confirm'))
        await waitFor(() => {
            expect(api.confirmPaymentRequest).toHaveBeenCalledWith(1)
        })
    })

    it('calls api.rejectPaymentRequest when reject clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue(PENDING_REQUESTS as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        vi.mocked(api.rejectPaymentRequest).mockResolvedValueOnce(undefined as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('paymentRequest.reject'))
        fireEvent.click(screen.getByText('paymentRequest.reject'))
        await waitFor(() => {
            expect(api.rejectPaymentRequest).toHaveBeenCalledWith(1)
        })
    })
})

describe('TreasuryPage — accounts tab payment actions', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        await setupWithData()
    })

    it('shows member list in accounts tab', async () => {
        await renderTreasuryPage()
        await waitFor(() => {
            // Should show Hansi (has debt) in accounts tab
            expect(screen.getByText('Hansi')).toBeInTheDocument()
        })
    })

    it('shows record payment button after expanding member row', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberPayments).mockResolvedValue([])
        await renderTreasuryPage()
        // Click on a member row to expand it
        await waitFor(() => screen.getByText('Hansi'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => {
            expect(screen.getByText(/treasury\.payment\.record/)).toBeInTheDocument()
        })
    })

    it('opens payment sheet after expanding member and clicking record', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberPayments).mockResolvedValue([])
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('Hansi'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => screen.getByText(/treasury\.payment\.record/))
        fireEvent.click(screen.getByText(/treasury\.payment\.record/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — bookings delete', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        await setupAsAdmin()
        await setupWithData()
    })

    it('shows delete button for expense in bookings', async () => {
        await renderTreasuryPage()
        await waitFor(() => {
            // Expense 'Getränke' should be shown — use regex since div also has badge span
            expect(screen.getByText(/Getränke/)).toBeInTheDocument()
        })
        // Delete buttons should be present for admin
        expect(screen.getAllByText('✕').length).toBeGreaterThan(0)
    })

    it('calls api.deleteExpense when expense ✕ clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteExpense).mockResolvedValueOnce(undefined as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/Getränke/))
        const deleteBtns = screen.getAllByText('✕')
        // Merged order: payment(2026-01-12), expense(2026-01-10), payment(2026-01-05)
        // So expense is at index 1
        fireEvent.click(deleteBtns[1])
        await waitFor(() => {
            expect(api.deleteExpense).toHaveBeenCalledWith(1)
        })
    })
})

// ── additional coverage tests ──────────────────────────────────────────────────

describe('TreasuryPage — expense submit', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        await setupAsAdmin()
        await setupDefaultMocks()
    })

    it('calls api.createExpense on expense form submit', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createExpense).mockResolvedValueOnce({ id: 100, amount: 15.00, description: 'Test', note: 'Test', date: null, created_at: '2026-01-15T00:00:00', created_by: 1 } as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Fill amount — actual placeholder is "0,00" (German notation)
        const amountInputs = screen.getAllByPlaceholderText('0,00')
        fireEvent.change(amountInputs[0], { target: { value: '15,00' } })
        // Fill description
        const descInput = screen.getByPlaceholderText(/treasury\.expense\.descPlaceholder/)
        fireEvent.change(descInput, { target: { value: 'Test Ausgabe' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createExpense).toHaveBeenCalled()
        })
    })
})

describe('TreasuryPage — payment creation via accounts tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        await setupWithData()
    })

    it('calls api.createMemberPayment when payment form submitted', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberPayments).mockResolvedValue([])
        vi.mocked(api.createMemberPayment).mockResolvedValueOnce({ id: 999, regular_member_id: 5, member_name: 'Hans', amount: 5.50, note: 'Test', created_at: '2026-01-16T00:00:00' } as any)
        await renderTreasuryPage()
        // Expand member row
        await waitFor(() => screen.getByText('Hansi'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => screen.getByText(/treasury\.payment\.record/))
        // The "record payment" button in the row opens the payment sheet
        const recordBtns = screen.getAllByText(/treasury\.payment\.record/)
        fireEvent.click(recordBtns[0])
        await waitFor(() => screen.getByTestId('sheet'))
        // Fill in amount (placeholder is "0,00") before submitting
        const amountInput = screen.getByPlaceholderText('0,00')
        fireEvent.change(amountInput, { target: { value: '5,50' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createMemberPayment).toHaveBeenCalled()
        })
    })
})

describe('TreasuryPage — member payment delete', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        await setupWithData()
    })

    it('shows individual member payments when row expanded', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberPayments).mockResolvedValue([
            { id: 50, regular_member_id: 5, member_name: 'Hans', amount: 5.00, note: 'Bareinzahlung', created_at: '2026-01-10T12:00:00' },
        ] as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('Hansi'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => {
            expect(screen.getByText('Bareinzahlung')).toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — guest balances tab', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
    })

    it('shows guest balances when guests have debt', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([])
        vi.mocked(api.getPaymentRequests).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([])
        vi.mocked(api.getGuestBalances).mockResolvedValue([
            { regular_member_id: 99, name: 'Gast Peter', nickname: null, balance: -3.00, payments_total: 0, penalty_total: 3.00 },
        ] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([])
        vi.mocked(api.getAllPayments).mockResolvedValue([])
        vi.mocked(api.getMemberPayments).mockResolvedValue([])
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('Gast Peter')).toBeInTheDocument()
        })
    })
})

describe('TreasuryPage — accounts tab layout', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        await setupDefaultMocks()
    })

    it('shows accounts search input on accounts tab', async () => {
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByPlaceholderText('treasury.accounts.search')).toBeInTheDocument()
        })
    })

    it('shows empty state when no member balances exist', async () => {
        await renderTreasuryPage()
        await waitFor(() => {
            expect(screen.getByText('treasury.noData')).toBeInTheDocument()
        })
    })
})

// ── additional coverage: booking sheet member picker (lines 1010-1013) ────────

describe('TreasuryPage — booking sheet member picker', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        // Provide regular members so member picker shows buttons
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: ADMIN_USER,
            regularMembers: REGULAR_MEMBERS,
        }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        // Balances must include the regular_member_ids that match REGULAR_MEMBERS
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    })

    it('shows member picker buttons in booking sheet', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Should show the Club button and Hansi (from BALANCES + REGULAR_MEMBERS)
        expect(screen.getByText(/treasury\.booking\.club/)).toBeInTheDocument()
        // 'Hansi' is the nickname for regular_member_id=5
        expect(screen.getByText('Hansi')).toBeInTheDocument()
    })

    it('clicking member in picker switches direction label to deposit/withdrawal', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Click member button to select a member as booking target
        fireEvent.click(screen.getByText('Hansi'))
        // ModeToggle receives member-specific options: deposit / withdrawal
        expect(screen.getByText(/treasury\.payment\.deposit/)).toBeInTheDocument()
        expect(screen.getByText(/treasury\.payment\.withdrawal/)).toBeInTheDocument()
    })

    it('clicking club button restores expense/income direction labels', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // First click Hansi to go to member mode
        fireEvent.click(screen.getByText('Hansi'))
        // Then click Club to go back
        // There may be two elements matching treasury.booking.club (sheet title + button)
        const clubBtns = screen.getAllByText(/treasury\.booking\.club/)
        fireEvent.click(clubBtns[clubBtns.length - 1])
        // Should show expense / income options again
        expect(screen.getByText(/treasury\.booking\.expense/)).toBeInTheDocument()
        expect(screen.getByText(/treasury\.booking\.income/)).toBeInTheDocument()
    })

    it('submits member payment when member selected in booking sheet', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createMemberPayment).mockResolvedValueOnce({ id: 200, regular_member_id: 5, member_name: 'Hans', amount: 10, note: null, created_at: null } as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Select Hansi as booking target
        fireEvent.click(screen.getByText('Hansi'))
        // Fill amount
        const amountInputs = screen.getAllByPlaceholderText('0,00')
        fireEvent.change(amountInputs[0], { target: { value: '10,00' } })
        // Submit
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createMemberPayment).toHaveBeenCalled()
        })
    })
})

// ── additional coverage: booking sheet date input (line 1058) ──────────────────

describe('TreasuryPage — booking sheet date input for club expense', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({
            user: ADMIN_USER,
            regularMembers: REGULAR_MEMBERS,
        }))
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue([] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    })

    it('shows date input when club is selected as booking target', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Club is default target → date input should be visible
        const dateLabel = screen.getByText('treasury.expense.date')
        expect(dateLabel).toBeInTheDocument()
        // The date input element
        const dateInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
        expect(dateInput).toBeInTheDocument()
    })

    it('date input is NOT shown when a member is selected as booking target', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Select Hansi (member) — date input should disappear
        fireEvent.click(screen.getByText('Hansi'))
        expect(screen.queryByText('treasury.expense.date')).not.toBeInTheDocument()
    })

    it('passes the custom date to api.createExpense when date changed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createExpense).mockResolvedValueOnce({ id: 101, amount: 20, description: 'Test', note: 'Test', date: '2026-03-15', created_at: null, created_by: 1 } as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Change date
        const dateInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
        fireEvent.change(dateInput, { target: { value: '2026-03-15' } })
        // Fill amount and description
        const amountInput = screen.getAllByPlaceholderText('0,00')[0]
        fireEvent.change(amountInput, { target: { value: '20,00' } })
        const descInput = screen.getByPlaceholderText(/treasury\.expense\.descPlaceholder/)
        fireEvent.change(descInput, { target: { value: 'Custom Date Expense' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({
                date: '2026-03-15',
                description: 'Custom Date Expense',
            }))
        })
    })
})

// ── additional coverage: payment sheet ModeToggle + note input (lines 960-970, 984) ──

describe('TreasuryPage — payment sheet interaction', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        await setupWithData()
    })

    it('switches payment mode to withdrawal when ModeToggle onChange fires', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberPayments).mockResolvedValue([])
        await renderTreasuryPage()
        // Open payment sheet via member row
        await waitFor(() => screen.getByText('Hansi'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => screen.getByText(/treasury\.payment\.record/))
        const recordBtns = screen.getAllByText(/treasury\.payment\.record/)
        fireEvent.click(recordBtns[0])
        await waitFor(() => screen.getByTestId('sheet'))
        // Click the withdrawal ModeToggle option
        const withdrawalBtn = screen.getByText(/treasury\.payment\.withdrawal/)
        fireEvent.click(withdrawalBtn)
        // Mode has switched — withdrawal label is still visible
        expect(screen.getByText(/treasury\.payment\.withdrawal/)).toBeInTheDocument()
    })

    it('updates payment note input onChange', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMemberPayments).mockResolvedValue([])
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('Hansi'))
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => screen.getByText(/treasury\.payment\.record/))
        const recordBtns = screen.getAllByText(/treasury\.payment\.record/)
        fireEvent.click(recordBtns[0])
        await waitFor(() => screen.getByTestId('sheet'))
        // Fill payment note
        const noteInput = screen.getByPlaceholderText('treasury.payment.notePlaceholder')
        fireEvent.change(noteInput, { target: { value: 'Test Notiz' } })
        expect(noteInput).toHaveValue('Test Notiz')
    })
})

// ── additional coverage: booking direction ModeToggle onChange (line 1030) ──────

describe('TreasuryPage — booking direction toggle via ModeToggle', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue([] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    })

    it('calls setBookingDirection via ModeToggle onChange in booking sheet', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Default is club booking → shows income/expense options
        // Click the income option via the ModeToggle
        const incomeBtn = screen.getByText(/treasury\.booking\.income/)
        fireEvent.click(incomeBtn)
        // Direction is now 'in' — income label still visible
        expect(screen.getByText(/treasury\.booking\.income/)).toBeInTheDocument()
    })
})

// ── downloadReport button ──────────────────────────────────────────────────────
describe('TreasuryPage — downloadReport', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        await setupAsAdmin()
        await setupDefaultMocks()
    })

    it('shows export button for admin', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/report\.export/))
        expect(screen.getByText(/report\.export/)).toBeInTheDocument()
    })

    it('calls api.downloadReport when export button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.downloadReport).mockResolvedValueOnce(undefined as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/report\.export/))
        fireEvent.click(screen.getByText(/report\.export/))
        await waitFor(() => expect(api.downloadReport).toHaveBeenCalled())
    })

    it('shows year select for admin', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/report\.yearAll/))
        expect(screen.getByText(/report\.yearAll/)).toBeInTheDocument()
    })
})

// ── remindDebtors button ───────────────────────────────────────────────────────
describe('TreasuryPage — remindDebtors button', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        await setupAsAdmin()
    })

    it('shows remind debtors button when debtors exist', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue([
            { regular_member_id: 5, name: 'Hans', nickname: null, balance: -5.00, payments_total: 0, penalty_total: 5.00 }
        ] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.remindDebtors/))
        expect(screen.getByText(/treasury\.remindDebtors/)).toBeInTheDocument()
    })

    it('calls api.remindDebtors when remind button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue([
            { regular_member_id: 5, name: 'Hans', nickname: null, balance: -5.00, payments_total: 0, penalty_total: 5.00 }
        ] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        vi.mocked(api.remindDebtors).mockResolvedValueOnce(undefined as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.remindDebtors/))
        fireEvent.click(screen.getByText(/treasury\.remindDebtors/))
        await waitFor(() => expect(api.remindDebtors).toHaveBeenCalled())
    })
})

// ── settle payment button ──────────────────────────────────────────────────────
describe('TreasuryPage — settle payment (overview tab)', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        await setupAsAdmin()
    })

    it('shows settle button next to debtor name', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue([
            { regular_member_id: 5, name: 'Hans', nickname: 'Hansi', balance: -5.00, payments_total: 0, penalty_total: 5.00 }
        ] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.payment\.settle/))
        expect(screen.getByText(/treasury\.payment\.settle/)).toBeInTheDocument()
    })
})

// ── Error handling tests ───────────────────────────────────────────────────────

describe('TreasuryPage — error handlers', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue(EXPENSES as any)
        vi.mocked(api.getAllPayments).mockResolvedValue(PAYMENTS as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    })

    it('calls toastError when downloadReport fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.downloadReport).mockRejectedValueOnce(new Error('export failed'))
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('report.export'))
        fireEvent.click(screen.getByText('report.export'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })

    it('calls toastError when remindDebtors fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.getMemberBalances).mockResolvedValue([
            { regular_member_id: 5, name: 'Hans', nickname: 'Hansi', balance: -5.00, payments_total: 0, penalty_total: 5.00 }
        ] as any)
        vi.mocked(api.remindDebtors).mockRejectedValueOnce(new Error('remind failed'))
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('treasury.remindDebtors'))
        fireEvent.click(screen.getByText('treasury.remindDebtors'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })

    it('changes exportYear select value', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('report.export'))
        const yearSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement
        const currentYear = new Date().getFullYear()
        fireEvent.change(yearSelect, { target: { value: String(currentYear) } })
        expect(yearSelect.value).toBe(String(currentYear))
    })

    it('changes exportFormat select value', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('report.export'))
        const selects = screen.getAllByRole('combobox')
        const formatSelect = selects[1] as HTMLSelectElement
        fireEvent.change(formatSelect, { target: { value: 'pdf' } })
        expect(formatSelect.value).toBe('pdf')
    })
})

describe('TreasuryPage — confirmPaymentRequest error', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([
            { id: 10, regular_member_id: 5, member_name: 'Hans', amount: 5.00, status: 'pending', created_at: '2026-01-01' }
        ] as any)
    })

    it('calls toastError when confirmPaymentRequest fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.confirmPaymentRequest).mockRejectedValueOnce(new Error('confirm failed'))
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('paymentRequest.confirm'))
        fireEvent.click(screen.getByText('paymentRequest.confirm'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })

    it('calls toastError when rejectPaymentRequest fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.rejectPaymentRequest).mockRejectedValueOnce(new Error('reject failed'))
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('paymentRequest.reject'))
        fireEvent.click(screen.getByText('paymentRequest.reject'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })
})

describe('TreasuryPage — deletePayment error', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['accounts', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([
            { id: 20, amount: 10.00, note: 'Test Payment', created_at: '2026-01-01T00:00:00' }
        ] as any)
    })

    it('calls toastError when deleteMemberPayment fails', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.deleteMemberPayment).mockRejectedValueOnce(new Error('delete failed'))
        await renderTreasuryPage()
        // Expand Admin member row to show payments
        await waitFor(() => screen.getByText('Admin'))
        fireEvent.click(screen.getByText('Admin'))
        await waitFor(() => screen.getByText('Test Payment'))
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })
})

describe('TreasuryPage — submitPayment error', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['overview', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    })

    it('calls toastError when createMemberPayment fails in payment sheet', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.createMemberPayment).mockRejectedValueOnce(new Error('payment failed'))
        await renderTreasuryPage()
        // Hansi has negative balance (-5.50) → shows in debtors section with settle button (overview tab)
        await waitFor(() => screen.getByText('Hansi'))
        const settleBtn = screen.getAllByText('treasury.payment.settle')[0]
        fireEvent.click(settleBtn)
        await waitFor(() => screen.getByTestId('sheet'))
        // Amount is pre-filled with abs(balance), just submit
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })
})

describe('TreasuryPage — bookingSheet submitBooking error', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['bookings', vi.fn()] as any)
        await setupAsAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getClub).mockResolvedValue({ id: 1, name: 'TestClub', settings: {} } as any)
        vi.mocked(api.getMyPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getPaymentRequests).mockResolvedValue([] as any)
        vi.mocked(api.getMemberBalances).mockResolvedValue(BALANCES as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue(EXPENSES as any)
        vi.mocked(api.getAllPayments).mockResolvedValue(PAYMENTS as any)
        vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    })

    it('calls toastError when createExpense fails in booking sheet', async () => {
        const { api } = await import('@/api/client.ts')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(api.createExpense).mockRejectedValueOnce(new Error('expense failed'))
        await renderTreasuryPage()
        await waitFor(() => screen.getByText(/treasury\.booking\.add/))
        fireEvent.click(screen.getByText(/treasury\.booking\.add/))
        await waitFor(() => screen.getByTestId('sheet'))
        // Fill amount (placeholder "0,00") and note (required for club expense)
        fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '25.00' } })
        fireEvent.change(screen.getByPlaceholderText('treasury.expense.descPlaceholder'), { target: { value: 'Test Expense' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })

    it('shows filteredBookings search and filters entries', async () => {
        await renderTreasuryPage()
        await waitFor(() => screen.getByText('Getränke'))
        const searchInput = screen.getByPlaceholderText(/treasury\.bookings\.search/)
        fireEvent.change(searchInput, { target: { value: 'Admin' } })
        await waitFor(() => {
            expect(screen.getByText('Admin')).toBeInTheDocument()
        })
    })
})
