import {cloneElement, isValidElement} from 'react'
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({user: {regular_member_id: 1}})),
}))
vi.mock('@/router', () => ({router: {navigate: vi.fn(() => Promise.resolve())}}))
vi.mock('@/api/client.ts', () => ({
    api: {
        getMemberBalances: vi.fn(), getGuestBalances: vi.fn(), getExpenses: vi.fn(),
        getAllPayments: vi.fn(), getYearStats: vi.fn(),
    },
}))
// jsdom has no layout, so give ResponsiveContainer concrete dimensions for Recharts SVG rendering.
vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts')
    return {
        ...actual,
        ResponsiveContainer: ({children, height}: any) => (
            <div data-testid="rc">
                {isValidElement(children)
                    ? cloneElement(children as any, {width: 340, height: typeof height === 'number' ? height : 220})
                    : children}
            </div>
        ),
    }
})

import {api} from '@/api/client.ts'
import {useEffectsStore} from '@/store/effects'
import {TreasuryCharts, PickBar} from '@/components/treasury/TreasuryCharts.tsx'

const m = (id: number, penalty: number, paid: number) => ({
    regular_member_id: id, name: `M${id}`, nickname: null, penalty_total: penalty, payments_total: paid, balance: paid - penalty,
})

function renderIt() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><TreasuryCharts/></QueryClientProvider>)
}

describe('TreasuryCharts', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: false})
        vi.mocked(api.getMemberBalances).mockResolvedValue([m(1, 100, 60), m(2, 40, 40)] as any)
        vi.mocked(api.getGuestBalances).mockResolvedValue([] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([{id: 1, amount: 20, description: 'x', created_at: '2026-01-01T00:00:00', date: null}] as any)
        vi.mocked(api.getAllPayments).mockResolvedValue([] as any)
        vi.mocked(api.getYearStats).mockResolvedValue({evenings: [{id: 1, date: '2026-01-10T20:00:00', venue: null, penalty_total: 30}]} as any)
    })
    afterEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
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

    it('renders readable treemap labels without inherited stroke and with danger-tint-fg contrast', async () => {
        renderIt()
        const treemap = await screen.findByTestId('chart-treemap')
        const svg = treemap.querySelector('svg.recharts-surface')
        expect(svg).not.toBeNull()
        expect(svg).not.toHaveAttribute('stroke')

        const texts = Array.from(treemap.querySelectorAll('text'))
        expect(texts.length).toBeGreaterThanOrEqual(2)
        expect(texts.some(el => el.textContent === 'M1')).toBe(true)
        for (const text of texts) {
            expect(text).toHaveAttribute('stroke', 'none')
            expect(text).toHaveAttribute('fill', 'var(--danger-tint-fg)')
        }
    })

    it('keeps the 0-axis aligned and bars flush on negative waterfall and trend values', async () => {
        const year = new Date().getFullYear()
        vi.mocked(api.getMemberBalances).mockResolvedValue([m(1, 50, 0)] as any)
        vi.mocked(api.getExpenses).mockResolvedValue([
            {id: 1, amount: 40, description: 'e1', created_at: `${year}-02-01T12:00:00`, date: null},
            {id: 2, amount: 60, description: 'e2', created_at: `${year}-03-01T12:00:00`, date: null},
        ] as any)
        renderIt()

        // All-negative trend must still include y=0 so its 0 reference line renders
        const trend = await screen.findByTestId('chart-trend')
        expect(trend.querySelector('.recharts-reference-line-line')).not.toBeNull()
        expect(trend.querySelector('.recharts-label')).toHaveTextContent('0')

        // Negative waterfall bar ('cash' = -100, range = [-100, 0]) must align flat at the 0-axis
        const waterfall = screen.getByTestId('chart-waterfall')
        const containers = waterfall.querySelectorAll('[data-testid="rc"]')
        const barChartEl = containers[1]
        const zeroLine = barChartEl.querySelector('.recharts-reference-line-line')!
        expect(zeroLine).toBeTruthy()
        const zeroX = Number(zeroLine.getAttribute('x1'))
        expect(zeroLine.getAttribute('x2')).toBe(String(zeroX))
        expect(zeroX).toBeGreaterThan(20)

        const rectPaths = Array.from(barChartEl.querySelectorAll('.recharts-bar-rectangle path'))
        expect(rectPaths.length).toBeGreaterThanOrEqual(2)
        // Each visible rectangle has either its left edge (positive) or right edge (negative) flush on zeroX
        for (const path of rectPaths) {
            const x = Number(path.getAttribute('x'))
            const w = Number(path.getAttribute('width'))
            const flushLeft = Math.abs(x - zeroX) < 1
            const flushRight = Math.abs(x + w - zeroX) < 1
            expect(flushLeft || flushRight).toBe(true)
        }
        // Negative bars extend left from zeroX with flat right corners (no arc ending at x = zeroX)
        const negPaths = rectPaths.filter(p => Number(p.getAttribute('x')) < zeroX - 1)
        expect(negPaths.length).toBeGreaterThanOrEqual(1)
        for (const p of negPaths) {
            const d = p.getAttribute('d') ?? ''
            expect(d).toMatch(/A 4,4/)
            // Top-right corner at zeroX must be a straight line, not rounded
            expect(d).toContain(`L ${Math.round(zeroX)},`)
        }
        // Labels stay visible even when paidIn is 0 (0-width bar) and mask the vertical 0-axis line
        const labels = Array.from(waterfall.querySelectorAll('.recharts-label-list text'))
        expect(labels.some(l => l.textContent?.includes('treasury.charts.step.paidIn'))).toBe(true)
        expect(labels.some(l => l.textContent?.includes('treasury.charts.step.cash'))).toBe(true)
        for (const label of labels) {
            expect(label).toHaveAttribute('paint-order', 'stroke')
        }
    })

    it('uses the translated penalties key instead of raw penalty_total in the evenings tooltip', async () => {
        renderIt()
        const evenings = await screen.findByTestId('chart-evenings')
        const surface = evenings.querySelector('.recharts-wrapper')
        expect(surface).not.toBeNull()
        fireEvent.mouseOver(surface!, {clientX: 170, clientY: 100})
        fireEvent.mouseMove(surface!, {clientX: 170, clientY: 100})
        await waitFor(() => {
            expect(evenings.textContent).toContain('treasury.charts.penalties')
        })
        expect(evenings.textContent).not.toContain('penalty_total')
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

    it('period chips switch the year used for the per-evening bars', async () => {
        renderIt()
        await waitFor(() => expect(screen.getByTestId('treasury-charts')).toBeInTheDocument())
        const year = new Date().getFullYear()
        fireEvent.click(screen.getByTestId(`period-${year - 1}`))
        await waitFor(() => expect(api.getYearStats).toHaveBeenCalledWith(year - 1))
        expect(screen.getByTestId(`period-${year - 1}`)).toHaveAttribute('aria-pressed', 'true')
    })

    it('PickBar shows the tapped value and only navigates via its explicit button', () => {
        const open = vi.fn()
        const sel = {chart: 'x', label: 'Eingezahlt', value: '100,00 €', open}
        const {rerender} = render(<PickBar sel={sel} chart="x"/>)
        expect(screen.getByTestId('pick-x')).toHaveTextContent('100,00 €')
        expect(open).not.toHaveBeenCalled()
        fireEvent.click(screen.getByTestId('pick-open-x'))
        expect(open).toHaveBeenCalledTimes(1)
        rerender(<PickBar sel={{...sel, open: undefined}} chart="x"/>)
        expect(screen.queryByTestId('pick-open-x')).toBeNull()
        rerender(<PickBar sel={sel} chart="other"/>)
        expect(screen.queryByTestId('pick-x')).toBeNull()
    })
})
