import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({ user: null, regularMembers: [] })),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getMemberBalances: vi.fn(),
        getGuestBalances: vi.fn(),
        getExpenses: vi.fn(),
        getAllPayments: vi.fn(),
        getMemberPayments: vi.fn(),
        getMemberPenalties: vi.fn(),
        getTreasuryDebtTimeline: vi.fn(),
    },
}))

vi.mock('@/components/ui/ModeToggle.tsx', () => ({
    ModeToggle: ({ onChange, options }: any) => (
        <div>
            {options?.map((o: any) => (
                <button key={o.value} onClick={() => onChange(o.value)}>{o.label}</button>
            ))}
        </div>
    ),
}))

// Captures the events actually handed to the graph, so the "only selected" filter's effect on
// the Kasse-scope actual line can be asserted without depending on the chart's own date windowing.
vi.mock('@/components/treasury/BalanceHistoryChart.tsx', () => ({
    BalanceHistoryChart: ({ actualEvents, overlayEvents, t }: any) =>
        actualEvents.length === 0 && overlayEvents.length === 0
            ? <div>{t('treasury.history.noData')}</div>
            : <div data-testid="chart-actual-event-ids">{actualEvents.map((e: any) => e.id).join(',')}</div>,
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const MEMBER_USER = {
    id: 2, role: 'member', email: 'member@test.de', name: 'Hans',
    username: null, club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 5,
}

// paid-in 10,00 € · outstanding 5,50 € · expenses 20,00 € → cash −10,00 €
const BALANCES = [
    { regular_member_id: 1, name: 'Admin', nickname: null, balance: 10.00, payments_total: 10.00, penalty_total: 0 },
    { regular_member_id: 5, name: 'Hans', nickname: 'Hansi', balance: -5.50, payments_total: 0, penalty_total: 5.50 },
]

const EXPENSES = [
    { id: 1, amount: 20.00, description: 'Getränke', date: null, created_at: '2026-01-10T10:00:00', updated_at: null },
]

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderAnalysis() {
    const { TreasuryAnalysis } = await import('../treasury/TreasuryAnalysis')
    return render(<TreasuryAnalysis />, { wrapper: makeWrapper() })
}

async function setupMocks(overrides: Record<string, any> = {}) {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getMemberBalances).mockResolvedValue((overrides.balances ?? BALANCES) as any)
    vi.mocked(api.getGuestBalances).mockResolvedValue((overrides.guests ?? []) as any)
    vi.mocked(api.getExpenses).mockResolvedValue((overrides.expenses ?? EXPENSES) as any)
    vi.mocked(api.getAllPayments).mockResolvedValue((overrides.payments ?? []) as any)
    vi.mocked(api.getMemberPayments).mockResolvedValue([] as any)
    vi.mocked(api.getMemberPenalties).mockResolvedValue([] as any)
    vi.mocked(api.getTreasuryDebtTimeline).mockResolvedValue([] as any)
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('TreasuryAnalysis', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useAppStore } = await import('@/store/app.ts')
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: MEMBER_USER, regularMembers: [] }))
        await setupMocks()
    })

    it('renders the money flow and the resulting cash figure', async () => {
        await renderAnalysis()
        await waitFor(() => {
            expect(screen.getByTestId('flow-amount-paidIn')).toHaveTextContent('+10,00 €')
            expect(screen.getByTestId('flow-amount-expenses')).toHaveTextContent('-20,00 €')
            expect(screen.getByTestId('flow-amount-outstanding')).toHaveTextContent('5,50 €')
            expect(screen.getByTestId('analysis-cash')).toHaveTextContent('-10,00 €')
        })
    })

    it('lists the member chips with the current user first and an Ich badge', async () => {
        await renderAnalysis()
        const scope = within(screen.getByTestId('balance-filter'))
        await waitFor(() => expect(scope.getByText('Hansi')).toBeInTheDocument())

        const chips = screen.getByTestId('balance-filter').querySelectorAll('button')
        // Hansi (regular_member_id 5 = the logged-in member) sorts to the front
        expect(chips[0].textContent).toContain('Hansi')
        expect(chips[0].textContent).toContain('common.me')
    })

    it('expands a flow row into the underlying bookings', async () => {
        await renderAnalysis()
        await waitFor(() => expect(screen.getByTestId('flow-amount-expenses')).toBeInTheDocument())
        expect(screen.queryByText('Getränke')).not.toBeInTheDocument()

        fireEvent.click(screen.getByText(/treasury\.flow\.expenses/))
        await waitFor(() => expect(screen.getByText('Getränke')).toBeInTheDocument())
    })

    it('offers a member scope for the history graph', async () => {
        await renderAnalysis()
        await waitFor(() => expect(screen.getByText(/treasury\.history\.scopeMember/)).toBeInTheDocument())

        fireEvent.click(screen.getByText(/treasury\.history\.scopeMember/))
        const { api } = await import('@/api/client.ts')
        await waitFor(() => expect(api.getMemberPenalties).toHaveBeenCalledWith(5))
    })

    it('shows an empty state when there is nothing to plot yet', async () => {
        await setupMocks({ balances: [], expenses: [] })
        await renderAnalysis()
        await waitFor(() => expect(screen.getByText(/treasury\.history\.noData/)).toBeInTheDocument())
    })

    it('keeps club-wide expenses in the Kasse history line without a filter or during the leaving simulation', async () => {
        const payments = [{ id: 1, regular_member_id: 5, member_name: 'Hansi', amount: 10, note: null, created_at: '2026-01-05T10:00:00', updated_at: null, date: null }]
        await setupMocks({ payments })
        await renderAnalysis()
        await waitFor(() => expect(screen.getByTestId('chart-actual-event-ids')).toHaveTextContent('expense-1'))
        expect(screen.getByTestId('chart-actual-event-ids')).toHaveTextContent('payment-1')

        // Selecting a member without "Nur Auswahl anzeigen" simulates them leaving — expenses
        // aren't attributable to a member and stay out of that simulation.
        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => expect(screen.getByTestId('balance-opt-only')).toBeInTheDocument())
        expect(screen.getByTestId('chart-actual-event-ids')).toHaveTextContent('expense-1')
    })

    it('excludes club-wide expenses from the Kasse history line when "only selected" restricts the view', async () => {
        const payments = [{ id: 1, regular_member_id: 5, member_name: 'Hansi', amount: 10, note: null, created_at: '2026-01-05T10:00:00', updated_at: null, date: null }]
        await setupMocks({ payments })
        await renderAnalysis()
        await waitFor(() => expect(screen.getByTestId('chart-actual-event-ids')).toHaveTextContent('expense-1'))

        fireEvent.click(screen.getByText('Hansi'))
        await waitFor(() => expect(screen.getByTestId('balance-opt-only')).toBeInTheDocument())
        fireEvent.click(screen.getByTestId('balance-opt-only'))

        await waitFor(() => {
            const ids = screen.getByTestId('chart-actual-event-ids').textContent
            expect(ids).toContain('payment-1')
            expect(ids).not.toContain('expense-1')
        })
    })
})
