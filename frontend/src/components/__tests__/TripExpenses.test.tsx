import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))
const storeState: any = {
    user: { id: 1, role: 'member', regular_member_id: 1 },
    regularMembers: [
        { id: 1, name: 'Anna', nickname: null, is_active: true, is_guest: false, deactivated_at: null },
        { id: 2, name: 'Bernd', nickname: 'Bernie', is_active: true, is_guest: false, deactivated_at: null },
        { id: 3, name: 'Olaf', nickname: null, is_active: true, is_guest: false, deactivated_at: '2026-01-01' },
    ],
}
vi.mock('@/store/app.ts', () => ({ useAppStore: vi.fn((sel: any) => sel(storeState)) }))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))
vi.mock('@/api/client.ts', () => ({ api: { getTripExpenses: vi.fn(), addTripExpense: vi.fn(), updateTripExpense: vi.fn(), deleteTripExpense: vi.fn() } }))

const TRIP = { id: 3, date: '2026-09-01T00:00', end_date: null, destination: 'Winterberg', note: null,
    created_by_name: null, created_at: null, expense_count: 2, expense_total: 140 }

const DATA = {
    trip_id: 3, total: 140,
    by_payer: [{ member_id: 2, name: 'Bernie', total: 140 }],
    expenses: [
        { id: 1, description: 'Tanken', amount: 40, date: '2026-09-01', paid_by_member_id: 2, paid_by_name: 'Bernie' },
        { id: 2, description: 'Bus', amount: 100, date: '2026-08-01', paid_by_member_id: 2, paid_by_name: 'Bernie' },
    ],
}

async function setup(trip: any = TRIP, canWrite = false) {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getTripExpenses).mockResolvedValue(DATA)
    vi.mocked(api.addTripExpense).mockResolvedValue(DATA)
    const { TripExpenses } = await import('../committee/TripExpenses')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><TripExpenses trip={trip} canWrite={canWrite}/></QueryClientProvider>)
    return api
}

beforeEach(() => vi.clearAllMocks())

describe('TripExpenses', () => {
    it('renders nothing without linked expenses and without write access', async () => {
        await setup({ ...TRIP, expense_count: 0, expense_total: 0 })
        expect(screen.queryByTestId('trip-expenses')).not.toBeInTheDocument()
        expect(screen.queryByTestId('trip-expense-add')).not.toBeInTheDocument()
    })

    it('shows the total collapsed, then per-payer sums and the list when opened', async () => {
        await setup()
        expect(screen.getByTestId('trip-expenses-total')).toHaveTextContent('140,00')
        fireEvent.click(screen.getAllByRole('button')[0])
        const byPayer = await screen.findByTestId('trip-expenses-by-payer')
        expect(within(byPayer).getByText('Bernie')).toBeInTheDocument()
        expect(within(byPayer).getByText(/140,00/)).toBeInTheDocument()
        expect(screen.getByText('Tanken')).toBeInTheDocument()
        expect(screen.getByText('Bus')).toBeInTheDocument()
    })

    it('lets the committee add an outlay, defaulting the payer to me', async () => {
        const api = await setup({ ...TRIP, expense_count: 0, expense_total: 0 }, true)
        fireEvent.click(screen.getByTestId('trip-expense-add'))
        const payers = await screen.findByTestId('trip-expense-payer')
        expect(within(payers).queryByText('Olaf')).not.toBeInTheDocument()
        expect(within(payers).getByText('Anna')).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(within(payers).getByText('Bernie'))
        fireEvent.change(screen.getByLabelText('treasury.expense.description'), { target: { value: 'Hotel' } })
        fireEvent.change(screen.getByLabelText('treasury.payment.amount'), { target: { value: '300,50' } })
        fireEvent.click(screen.getByText(/action.save/))
        await waitFor(() => expect(api.addTripExpense).toHaveBeenCalledWith(3, expect.objectContaining({
            paid_by_member_id: 2, amount: 300.5, description: 'Hotel',
        })))
    })

    it('edits an outlay from its menu, keeping the payer', async () => {
        const api = await setup(TRIP, true)
        vi.mocked(api.updateTripExpense).mockResolvedValue(DATA)
        fireEvent.click(screen.getAllByRole('button')[0])
        await screen.findByText('Tanken')
        fireEvent.click(screen.getAllByLabelText('action.more')[0])
        fireEvent.click(await screen.findByText('action.edit'))
        fireEvent.change(await screen.findByLabelText('treasury.payment.amount'), { target: { value: '45' } })
        fireEvent.click(screen.getByText(/action.save/))
        await waitFor(() => expect(api.updateTripExpense).toHaveBeenCalledWith(3, 1, expect.objectContaining({
            paid_by_member_id: 2, amount: 45, description: 'Tanken',
        })))
    })

    it('deletes an outlay only after confirming', async () => {
        const api = await setup(TRIP, true)
        vi.mocked(api.deleteTripExpense).mockResolvedValue(DATA)
        fireEvent.click(screen.getAllByRole('button')[0])
        await screen.findByText('Tanken')
        fireEvent.click(screen.getAllByLabelText('action.more')[0])
        fireEvent.click(await screen.findByText('action.delete'))
        expect(api.deleteTripExpense).not.toHaveBeenCalled()
        fireEvent.click(await screen.findByText('trip.expenses.deleteConfirm').then(() => screen.getAllByText('action.delete').slice(-1)[0]))
        await waitFor(() => expect(api.deleteTripExpense).toHaveBeenCalledWith(3, 1))
    })
})
