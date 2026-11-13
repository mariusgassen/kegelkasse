import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({user: {regular_member_id: 1}})),
}))
vi.mock('@/api/client.ts', () => ({
    api: {
        getMemberBalances: vi.fn(), getGuestBalances: vi.fn(), getExpenses: vi.fn(),
        getAllPayments: vi.fn(), getYearStats: vi.fn(),
    },
}))
// jsdom has no layout, so ResponsiveContainer would render nothing — unwrap it.
vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts')
    return {...actual, ResponsiveContainer: ({children}: any) => <div data-testid="rc">{children}</div>}
})

import {api} from '@/api/client.ts'
import {TreasuryCharts} from '@/components/treasury/TreasuryCharts.tsx'

const m = (id: number, penalty: number, paid: number) => ({
    regular_member_id: id, name: `M${id}`, nickname: null, penalty_total: penalty, payments_total: paid, balance: paid - penalty,
})

function renderIt() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><TreasuryCharts/></QueryClientProvider>)
}

describe('TreasuryCharts', () => {
    beforeEach(() => {
        vi.mocked(api.getMemberBalances).mockResolvedValue([m(1, 100, 60), m(2, 40, 40)] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([{id: 1, amount: 20, description: 'x', created_at: '2026-01-01T00:00:00', date: null}] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getYearStats).mockResolvedValue({evenings: [{id: 1, date: '2026-01-10T20:00:00', venue: null, penalty_total: 30}]} as any)
    })

    it('shows a loading skeleton first, then all five chart cards', async () => {
        renderIt()
        expect(screen.getByTestId('charts-loading')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByTestId('treasury-charts')).toBeInTheDocument())
        for (const id of ['chart-waterfall', 'chart-treemap', 'chart-evenings', 'chart-sankey', 'chart-donut'])
            expect(screen.getByTestId(id)).toBeInTheDocument()
    })

    it('shows the paid share in the donut centre', async () => {
        renderIt()
        // paid 100 of 140 penalties
        await waitFor(() => expect(screen.getByTestId('donut-pct')).toHaveTextContent('71 %'))
    })

    it('shows empty states without debts, evenings or penalties', async () => {
        vi.mocked(api.getMemberBalances).mockResolvedValue([] as any)
        vi.mocked(api.getYearStats).mockResolvedValue({evenings: []} as any)
        vi.mocked(api.getExpenses).mockResolvedValue([] as any)
        renderIt()
        await waitFor(() => expect(screen.getByText('treasury.charts.noDebt')).toBeInTheDocument())
        expect(screen.getByText('treasury.charts.noEvenings')).toBeInTheDocument()
        expect(screen.getByText('treasury.charts.noFlow')).toBeInTheDocument()
        expect(screen.getByText('treasury.charts.noPenalties')).toBeInTheDocument()
    })
})
