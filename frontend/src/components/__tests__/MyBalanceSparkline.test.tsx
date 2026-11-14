import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {createEvent, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/api/client.ts', () => ({
    api: {
        getMemberPayments: vi.fn(),
        getMemberPenalties: vi.fn(),
    },
}))

import {api} from '@/api/client.ts'
import {useEffectsStore} from '@/store/effects'
import {MyBalanceSparkline} from '@/components/treasury/MyBalanceSparkline.tsx'

function renderSparkline() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><MyBalanceSparkline memberId={1}/></QueryClientProvider>)
}

describe('MyBalanceSparkline', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: false})
    })
    afterEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('splits positive and negative coloring across y=0 and shows a small set of x-axis reference dates', async () => {
        vi.mocked(api.getMemberPayments).mockResolvedValue([
            {id: 1, amount: 30, note: null, created_at: '2026-01-05T10:00:00', updated_at: null, date: '2026-01-05T10:00:00'},
            {id: 2, amount: 50, note: null, created_at: '2026-04-05T10:00:00', updated_at: null, date: '2026-04-05T10:00:00'},
        ] as any)
        vi.mocked(api.getMemberPenalties).mockResolvedValue([
            {id: 1, amount: 60, icon: '🍺', penalty_type_name: 'Pudel', evening_id: 1, evening_date: '2026-02-05T20:00:00', is_absence: false, created_at: '2026-02-05T20:30:00'},
            {id: 2, amount: 5, icon: '🍺', penalty_type_name: 'Pudel', evening_id: 2, evening_date: '2026-03-05T20:00:00', is_absence: false, created_at: '2026-03-05T20:30:00'},
            {id: 3, amount: 5, icon: '🍺', penalty_type_name: 'Pudel', evening_id: 3, evening_date: '2026-03-20T20:00:00', is_absence: false, created_at: '2026-03-20T20:30:00'},
        ] as any)

        renderSparkline()
        const root = await screen.findByTestId('my-balance-sparkline')

        // Gradient split at zero using positive-fg and danger-fg tokens
        const grads = root.querySelectorAll('linearGradient')
        expect(grads).toHaveLength(2)
        const stops = Array.from(grads[0].querySelectorAll('stop'))
        expect(stops.map(s => s.getAttribute('stop-color'))).toEqual([
            'var(--positive-fg)', 'var(--positive-fg)', 'var(--danger-fg)', 'var(--danger-fg)',
        ])

        // Concise x-axis reference labels: capped at 3 even with 6 points
        const xTicks = Array.from(root.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value'))
        expect(xTicks.length).toBeGreaterThanOrEqual(2)
        expect(xTicks.length).toBeLessThanOrEqual(3)

        // Prevents accidental text selection on mousedown
        expect(root).toHaveClass('select-none')
        const md = createEvent.mouseDown(root)
        fireEvent(root, md)
        expect(md.defaultPrevented).toBe(true)
    })

    it('shows date and balance label with reference dot when clicking a point', async () => {
        vi.mocked(api.getMemberPayments).mockResolvedValue([
            {id: 1, amount: 40, note: null, created_at: '2026-01-10T10:00:00', updated_at: null, date: '2026-01-10T10:00:00'},
            {id: 2, amount: 20, note: null, created_at: '2026-03-10T10:00:00', updated_at: null, date: '2026-03-10T10:00:00'},
        ] as any)
        vi.mocked(api.getMemberPenalties).mockResolvedValue([
            {id: 1, amount: 15, icon: '🍺', penalty_type_name: 'Pudel', evening_id: 1, evening_date: '2026-02-10T20:00:00', is_absence: false, created_at: '2026-02-10T20:30:00'},
        ] as any)

        renderSparkline()
        const root = await screen.findByTestId('my-balance-sparkline')
        const wrapper = root.querySelector('.recharts-wrapper')!
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, toJSON: () => ({}),
        })

        fireEvent.mouseMove(wrapper, {clientX: 200, clientY: 50})
        fireEvent.click(wrapper, {clientX: 200, clientY: 50})

        await waitFor(() => expect(screen.getByTestId('sparkline-selected')).toBeInTheDocument())
        expect(screen.getByTestId('sparkline-selected')).toHaveTextContent('€')
        expect(root.querySelector('.recharts-reference-dot-dot')).not.toBeNull()
    })
})
