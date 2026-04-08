import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SeasonSnapshot } from '@/types.ts'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/api/client.ts', () => ({
    api: {
        listSeasonSnapshots: vi.fn(),
        getSeasonSnapshot: vi.fn(),
        closeSeason: vi.fn(),
        getMemberBalances: vi.fn(),
        downloadReport: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))
vi.mock('@/components/ui/Empty.tsx', () => ({
    Empty: ({ text }: any) => <div data-testid="empty">{text}</div>,
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const SNAP: SeasonSnapshot = {
    id: 1,
    year: 2024,
    closed_at: '2025-01-05T10:00:00',
    closed_by_name: 'Admin',
    member_count: 10,
    evening_count: 18,
    carry_over_count: 3,
    total_penalties: 142.5,
    total_payments: 120.0,
    ranking_data: [],
    notes: null,
}

const BALANCE = {
    regular_member_id: 1,
    name: 'Hans Müller',
    nickname: 'Hanse',
    penalty_total: 50.0,
    payments_total: 30.0,
    balance: -20.0,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderSeasonTab() {
    const { SeasonTab } = await import('../SeasonTab')
    return render(<SeasonTab />, { wrapper: makeWrapper() })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SeasonTab — landing view', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
    })

    it('renders year selector and close button when no snapshot exists', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        await renderSeasonTab()
        await waitFor(() => {
            expect(screen.getByText('season.title')).toBeInTheDocument()
        })
        const btn = screen.getByText(/season\.close/i)
        expect(btn).toBeInTheDocument()
    })

    it('shows no-history empty state when snapshots list is empty', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        await renderSeasonTab()
        await waitFor(() => {
            expect(screen.getByTestId('empty')).toBeInTheDocument()
        })
        expect(screen.getByText('season.noHistory')).toBeInTheDocument()
    })

    it('disables close button when snapshot already exists for selected year', async () => {
        const currentYear = new Date().getFullYear()
        const snap: SeasonSnapshot = { ...SNAP, year: currentYear }
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([snap])
        await renderSeasonTab()
        await waitFor(() => {
            expect(screen.getByText(/season\.alreadyClosed/i)).toBeInTheDocument()
        })
        // Close button replaced by "already closed" message — no enabled button
        expect(screen.queryByRole('button', { name: /season\.close/i })).not.toBeInTheDocument()
    })

    it('renders past snapshot card when history exists', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([SNAP])
        await renderSeasonTab()
        await waitFor(() => {
            expect(screen.getByText(/season\.snapshot\.year/i)).toBeInTheDocument()
        })
    })
})

describe('SeasonTab — wizard navigation', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
    })

    it('navigates to step 1 (preview) when close button is clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([])
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => {
            expect(screen.getByText('season.step1.title')).toBeInTheDocument()
        })
    })

    it('shows no-debts message in preview when all balances are zero', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([
            { ...BALANCE, balance: 0 },
        ] as any)
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => {
            expect(screen.getByText('season.step1.noDebts')).toBeInTheDocument()
        })
    })

    it('shows member balance in preview when non-zero', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([BALANCE] as any)
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => {
            // Kegelname shown
            expect(screen.getByText('Hanse')).toBeInTheDocument()
        })
    })

    it('navigates to confirm step when Weiter is clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([])
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => screen.getByText('season.step1.title'))
        fireEvent.click(screen.getByText(/action\.continue/i))
        await waitFor(() => {
            expect(screen.getByText('season.step2.title')).toBeInTheDocument()
        })
        expect(screen.getByText('season.confirm')).toBeInTheDocument()
    })
})

describe('SeasonTab — season close action', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
    })

    it('calls api.closeSeason with correct year on confirm', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([])
        vi.mocked(api.closeSeason).mockResolvedValue(SNAP)
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => screen.getByText('season.step1.title'))
        fireEvent.click(screen.getByText(/action\.continue/i))
        await waitFor(() => screen.getByText('season.confirm'))
        fireEvent.click(screen.getByText('season.confirm'))
        await waitFor(() => {
            expect(vi.mocked(api.closeSeason)).toHaveBeenCalledWith(
                expect.any(Number),
                undefined,
            )
        })
    })

    it('shows done view after successful close', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([])
        vi.mocked(api.closeSeason).mockResolvedValue(SNAP)
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => screen.getByText('season.step1.title'))
        fireEvent.click(screen.getByText(/action\.continue/i))
        await waitFor(() => screen.getByText('season.confirm'))
        fireEvent.click(screen.getByText('season.confirm'))
        await waitFor(() => {
            expect(screen.getByText('season.done.title')).toBeInTheDocument()
        })
        expect(screen.getByText('season.done.download')).toBeInTheDocument()
    })

    it('navigates back to landing when "Zurück" is clicked from done', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.listSeasonSnapshots).mockResolvedValue([])
        vi.mocked(api.getMemberBalances).mockResolvedValue([])
        vi.mocked(api.closeSeason).mockResolvedValue(SNAP)
        await renderSeasonTab()
        await waitFor(() => screen.getByText(/season\.close/i))
        fireEvent.click(screen.getByText(/season\.close/i))
        await waitFor(() => screen.getByText('season.step1.title'))
        fireEvent.click(screen.getByText(/action\.continue/i))
        await waitFor(() => screen.getByText('season.confirm'))
        fireEvent.click(screen.getByText('season.confirm'))
        await waitFor(() => screen.getByText('season.done.back'))
        fireEvent.click(screen.getByText('season.done.back'))
        await waitFor(() => {
            expect(screen.getByText('season.title')).toBeInTheDocument()
        })
    })
})
