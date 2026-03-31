import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
}))

vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: vi.fn(),
}))

vi.mock('@/hooks/usePage.ts', () => ({
    useHashTab: vi.fn(() => ['penalties', vi.fn()]),
    clearAuthParams: vi.fn(),
}))

vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => new URLSearchParams(''),
    clearHashParams: vi.fn(),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        updateEvening: vi.fn(),
        addHighlight: vi.fn(),
        deleteHighlight: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({
    toastError: vi.fn(),
}))

vi.mock('@/components/ui/CommentThread.tsx', () => ({
    CommentThread: () => null,
}))

vi.mock('@/components/ui/ItemReactionBar.tsx', () => ({
    ItemReactionBar: () => null,
}))

vi.mock('@/components/ui/MediaUploadButton.tsx', () => ({
    MediaUploadButton: () => null,
}))

vi.mock('../ProtocolPage', () => ({
    ProtocolPage: () => <div data-testid="protocol-page">Protocol</div>,
}))

vi.mock('../GamesPage', () => ({
    GamesPage: () => <div data-testid="games-page">Games</div>,
}))

vi.mock('../TabletQuickEntryPage', () => ({
    TabletQuickEntryPage: () => <div data-testid="tablet-quick-entry">Quick Entry</div>,
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvening(overrides = {}) {
    return {
        id: 1,
        date: '2026-03-26',
        venue: 'Kegelbahn',
        note: null,
        is_closed: false,
        players: [{ id: 1, name: 'Hans', is_king: false }],
        teams: [],
        penalty_log: [],
        games: [],
        drink_rounds: [],
        highlights: [],
        ...overrides,
    }
}

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

async function renderHubPage(props = {}) {
    const { EveningHubPage } = await import('../EveningHubPage')
    return render(<EveningHubPage onNavigate={vi.fn()} {...props} />, { wrapper })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('EveningHubPage — no active evening', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows "no active evening" prompt when activeEveningId is null', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: null, isLoading: false, invalidate: vi.fn(),
            activeEveningId: null, isPending: false,
        } as any)

        await renderHubPage()
        expect(screen.getByText('evening.noActive')).toBeInTheDocument()
    })

    it('calls onNavigate when start button is clicked (no evening)', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: null, isLoading: false, invalidate: vi.fn(),
            activeEveningId: null, isPending: false,
        } as any)

        const onNavigate = vi.fn()
        await renderHubPage({ onNavigate })
        fireEvent.click(screen.getByText('evening.startButton'))
        expect(onNavigate).toHaveBeenCalledOnce()
    })
})

describe('EveningHubPage — with active evening', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function setup(eveningData = makeEvening()) {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningData, isLoading: false, invalidate: vi.fn(),
            activeEveningId: eveningData.id, isPending: false,
        } as any)
        vi.mocked(useHashTab).mockReturnValue(['penalties', vi.fn()] as any)
        return renderHubPage()
    }

    it('renders sub-tab strip with all tabs', async () => {
        await setup()
        expect(screen.getByText(/evening.tab.log/)).toBeInTheDocument()
        expect(screen.getByText(/nav.games/)).toBeInTheDocument()
        expect(screen.getByText(/evening.tab.highlights/)).toBeInTheDocument()
    })

    it('shows the close (■) button for an open evening', async () => {
        await setup()
        expect(screen.getByTitle('evening.end')).toBeInTheDocument()
    })

    it('shows close-confirm bar when close button clicked', async () => {
        await setup()
        fireEvent.click(screen.getByTitle('evening.end'))
        expect(screen.getByText('evening.endConfirm')).toBeInTheDocument()
        expect(screen.getByText('action.cancel')).toBeInTheDocument()
    })

    it('hides confirm bar when cancel is clicked', async () => {
        await setup()
        fireEvent.click(screen.getByTitle('evening.end'))
        expect(screen.getByText('action.cancel')).toBeInTheDocument()
        fireEvent.click(screen.getByText('action.cancel'))
        expect(screen.queryByText('evening.endConfirm')).not.toBeInTheDocument()
    })

    it('calls api.updateEvening to close evening when confirmed', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateEvening).mockResolvedValueOnce({} as any)
        await setup()
        fireEvent.click(screen.getByTitle('evening.end'))
        fireEvent.click(screen.getByText('action.done'))
        await waitFor(() => {
            expect(api.updateEvening).toHaveBeenCalledWith(1, { is_closed: true })
        })
    })

    it('shows reopen button for a closed evening', async () => {
        await setup(makeEvening({ is_closed: true }))
        expect(screen.getByTitle('evening.reopen')).toBeInTheDocument()
    })

    it('shows empty state in highlights tab when no highlights', async () => {
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['highlights', vi.fn()] as any)
        await setup(makeEvening({ highlights: [] }))
        expect(screen.getByText('highlight.none')).toBeInTheDocument()
    })

    it('shows highlight input in highlights tab when evening is open', async () => {
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['highlights', vi.fn()] as any)
        await setup(makeEvening({ highlights: [] }))
        expect(screen.getByPlaceholderText('highlight.placeholder')).toBeInTheDocument()
    })

    it('does not show highlight input when evening is closed', async () => {
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['highlights', vi.fn()] as any)
        await setup(makeEvening({ is_closed: true, highlights: [] }))
        expect(screen.queryByPlaceholderText('highlight.placeholder')).not.toBeInTheDocument()
    })

    it('renders highlight cards when highlights exist', async () => {
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['highlights', vi.fn()] as any)
        const highlights = [
            { id: 10, text: 'Great shot!', media_url: null, created_at: '' },
        ]
        await setup(makeEvening({ highlights }))
        expect(screen.getByText('Great shot!')).toBeInTheDocument()
    })

    it('calls api.addHighlight when + button is clicked with text', async () => {
        const { api } = await import('@/api/client.ts')
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['highlights', vi.fn()] as any)
        vi.mocked(api.addHighlight).mockResolvedValueOnce({} as any)
        await setup(makeEvening({ highlights: [] }))

        fireEvent.change(screen.getByPlaceholderText('highlight.placeholder'), {
            target: { value: 'Amazing shot!' },
        })
        fireEvent.click(screen.getByText('+'))
        await waitFor(() => {
            expect(api.addHighlight).toHaveBeenCalledWith(1, { text: 'Amazing shot!' })
        })
    })

    it('calls api.deleteHighlight when delete button is clicked', async () => {
        const { api } = await import('@/api/client.ts')
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useHashTab).mockReturnValue(['highlights', vi.fn()] as any)
        vi.mocked(api.deleteHighlight).mockResolvedValueOnce(undefined as any)
        const highlights = [{ id: 10, text: 'To be deleted', media_url: null, created_at: '' }]
        await setup(makeEvening({ highlights }))

        fireEvent.click(screen.getByText('✕'))
        await waitFor(() => {
            expect(api.deleteHighlight).toHaveBeenCalledWith(1, 10)
        })
    })

    it('switches tab when tab button is clicked', async () => {
        const setSubTab = vi.fn()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const { useHashTab } = await import('@/hooks/usePage.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: makeEvening(), isLoading: false, invalidate: vi.fn(),
            activeEveningId: 1, isPending: false,
        } as any)
        vi.mocked(useHashTab).mockReturnValue(['penalties', setSubTab] as any)
        await renderHubPage()

        const tabButtons = screen.getAllByText(/nav\.games/)
        fireEvent.click(tabButtons[0])
        expect(setSubTab).toHaveBeenCalledWith('games')
    })
})
