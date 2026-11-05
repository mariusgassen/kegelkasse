import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

const storeState: any = { user: { id: 1, role: 'member', regular_member_id: 1 }, regularMembers: [] }
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel(storeState)),
    isAdmin: vi.fn(() => false),
}))
vi.mock('@/hooks/useOnline.ts', () => ({ useOnline: () => true }))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))

vi.mock('@/api/client.ts', () => ({
    api: {
        getTripCash: vi.fn(),
        setTripParticipants: vi.fn(),
        addTripExpense: vi.fn(),
        deleteTripExpense: vi.fn(),
    },
}))

const TRIP = { id: 3, date: '2026-09-01T00:00', end_date: null, destination: 'Winterberg', note: null, created_by_name: null, created_at: null }

const P = [
    { id: 1, name: 'Anna', nickname: null, is_guest: false },
    { id: 2, name: 'Bernd', nickname: 'Bernie', is_guest: false },
    { id: 3, name: 'Carla', nickname: null, is_guest: false },
]

function cash(overrides: Record<string, any> = {}) {
    return {
        trip_id: 3, can_manage: false, can_add: true, total: 90, participants: P,
        expenses: [{ id: 11, kind: 'expense', description: 'Bus', amount: 90, paid_by_member_id: 2, to_member_id: null,
            split_member_ids: null, date: '2026-09-01', created_by_name: 'Bernd', can_delete: false }],
        balances: [
            { ...P[0], paid: 0, share: 30, balance: -30 },
            { ...P[1], paid: 90, share: 30, balance: 60 },
            { ...P[2], paid: 0, share: 30, balance: -30 },
        ],
        settlements: [
            { from_member_id: 1, to_member_id: 2, amount: 30 },
            { from_member_id: 3, to_member_id: 2, amount: 30 },
        ],
        ...overrides,
    }
}

async function setup(data: any = cash()) {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.getTripCash).mockResolvedValue(data)
    vi.mocked(api.addTripExpense).mockResolvedValue(data)
    vi.mocked(api.setTripParticipants).mockResolvedValue(data)
    vi.mocked(api.deleteTripExpense).mockResolvedValue(data)
    const { TripCashSheet } = await import('../committee/TripCashSheet')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><TripCashSheet trip={TRIP as any} open onClose={() => {}}/></QueryClientProvider>)
    await screen.findByTestId('trip-cash')
    return api
}

beforeEach(() => {
    vi.clearAllMocks()
    storeState.user = { id: 1, role: 'member', regular_member_id: 1 }
    storeState.regularMembers = []
})

describe('TripCashSheet', () => {
    it('shows total, my balance, settlements and entries', async () => {
        await setup()
        expect(screen.getByTestId('trip-cash-total')).toHaveTextContent('90,00')
        expect(screen.getByTestId('trip-cash-mine')).toHaveTextContent('tripCash.youOwe')
        const settle = screen.getByTestId('trip-cash-settlements')
        expect(within(settle).getAllByText('Bernie')).toHaveLength(2)
        expect(within(screen.getByTestId('trip-cash-entries')).getByText('Bus')).toBeInTheDocument()
        expect(screen.queryByTestId('trip-cash-participants')).not.toBeInTheDocument()
    })

    it('books a settle-up payment as a transfer', async () => {
        const api = await setup()
        fireEvent.click(within(screen.getByTestId('trip-cash-settlements')).getAllByText('tripCash.markPaid')[0])
        await waitFor(() => expect(api.addTripExpense).toHaveBeenCalledWith(3, expect.objectContaining({
            kind: 'transfer', amount: 30, paid_by_member_id: 1, to_member_id: 2,
        })))
    })

    it('adds an expense split among a subset, defaulting the payer to me', async () => {
        const api = await setup()
        fireEvent.click(screen.getByTestId('trip-cash-add'))
        fireEvent.change(screen.getByLabelText('tripCash.description'), { target: { value: 'Pizza' } })
        fireEvent.change(screen.getByLabelText('tripCash.amount'), { target: { value: '12,50' } })
        fireEvent.click(within(screen.getByTestId('trip-cash-split')).getByText('Carla'))
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => expect(api.addTripExpense).toHaveBeenCalledWith(3, {
            kind: 'expense', description: 'Pizza', amount: 12.5, paid_by_member_id: 1, split_member_ids: [1, 2],
        }))
    })

    it('omits the split when everyone shares', async () => {
        const api = await setup()
        fireEvent.click(screen.getByTestId('trip-cash-add'))
        fireEvent.change(screen.getByLabelText('tripCash.description'), { target: { value: 'Hotel' } })
        fireEvent.change(screen.getByLabelText('tripCash.amount'), { target: { value: '300' } })
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => expect(api.addTripExpense).toHaveBeenCalledWith(3, {
            kind: 'expense', description: 'Hotel', amount: 300, paid_by_member_id: 1,
        }))
    })

    it('lets the committee manage participants', async () => {
        storeState.regularMembers = [
            ...P.map(p => ({ ...p, is_active: true, deactivated_at: null })),
            { id: 4, name: 'Dieter', nickname: null, is_guest: true, is_active: true, deactivated_at: null },
        ]
        const api = await setup(cash({ can_manage: true }))
        fireEvent.click(screen.getByText(/tripCash.participants \(3\)/))
        fireEvent.click(within(screen.getByTestId('trip-cash-participants')).getByText(/Dieter/))
        await waitFor(() => expect(api.setTripParticipants).toHaveBeenCalledWith(3, [1, 2, 3, 4]))
    })

    it('deletes an entry after confirmation', async () => {
        const data = cash()
        data.expenses[0].can_delete = true
        const api = await setup(data)
        fireEvent.click(screen.getByLabelText('action.more'))
        fireEvent.click(await screen.findByText('action.delete'))
        const confirm = await screen.findAllByText('action.delete')
        fireEvent.click(confirm[confirm.length - 1])
        await waitFor(() => expect(api.deleteTripExpense).toHaveBeenCalledWith(3, 11))
    })

    it('shows "all even" when nothing is owed', async () => {
        await setup(cash({ settlements: [], balances: P.map(p => ({ ...p, paid: 0, share: 0, balance: 0 })) }))
        expect(screen.getByTestId('trip-cash-even')).toBeInTheDocument()
    })
})
