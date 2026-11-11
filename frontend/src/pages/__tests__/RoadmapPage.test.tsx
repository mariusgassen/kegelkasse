import React from 'react'
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {RoadmapItem} from '@/types'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

const storeState: any = {user: null}
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel(storeState)),
    isAdmin: vi.fn((u: any) => u?.role === 'admin' || u?.role === 'superadmin'),
}))

vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/lib/haptics.ts', () => ({haptic: vi.fn()}))

vi.mock('@/api/client.ts', () => ({
    api: {
        listRoadmap: vi.fn(),
        createRoadmapItem: vi.fn(),
        toggleRoadmapVote: vi.fn(),
        updateRoadmapItem: vi.fn(),
        deleteRoadmapItem: vi.fn(),
    },
}))

import {api} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {RoadmapPage} from '../RoadmapPage'

const MOCK_ITEMS: RoadmapItem[] = [
    {
        id: 1,
        club_id: null,
        created_by_user_id: null,
        author_name: 'Kegelkasse Team',
        title: 'Desktop-Master-Detail',
        description: 'Zweispaltige Ansicht auf großen Bildschirmen',
        status: 'planned',
        category: 'feature',
        target_version: '2.0',
        is_official: true,
        vote_count: 12,
        has_voted: false,
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
    },
    {
        id: 2,
        club_id: 1,
        created_by_user_id: 10,
        author_name: 'Hansi',
        title: 'Königs-Tippspiel',
        description: 'Vor dem Eröffnungsspiel auf den König tippen',
        status: 'idea',
        category: 'feature',
        target_version: null,
        is_official: false,
        vote_count: 5,
        has_voted: true,
        created_at: '2026-11-05T12:00:00Z',
        updated_at: '2026-11-05T12:00:00Z',
    },
    {
        id: 3,
        club_id: null,
        created_by_user_id: null,
        author_name: 'Kegelkasse Team',
        title: 'Sticker-Wand',
        description: 'Vereins-Sticker auf der Weltkarte',
        status: 'completed',
        category: 'feature',
        target_version: '1.73',
        is_official: true,
        vote_count: 20,
        has_voted: false,
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-01T10:00:00Z',
    },
]

function renderPage() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(
        <QueryClientProvider client={qc}>
            <RoadmapPage />
        </QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    storeState.user = {id: 10, role: 'member', club_id: 1}
    vi.mocked(api.listRoadmap).mockResolvedValue(MOCK_ITEMS)
})

describe('RoadmapPage', () => {
    it('renders the header and lists roadmap items', async () => {
        renderPage()
        expect(screen.getByText('roadmap.title')).toBeInTheDocument()
        expect(screen.getByText('roadmap.subtitle')).toBeInTheDocument()

        await waitFor(() => {
            expect(screen.getByText('Desktop-Master-Detail')).toBeInTheDocument()
            expect(screen.getByText('Königs-Tippspiel')).toBeInTheDocument()
            expect(screen.getByText('Sticker-Wand')).toBeInTheDocument()
        })
    })

    it('filters items by tab', async () => {
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('Desktop-Master-Detail')).toBeInTheDocument()
        })

        // Click 'Ideenpool' tab
        fireEvent.click(screen.getByText('roadmap.tab.idea'))

        // Only Königs-Tippspiel should remain
        expect(screen.getByText('Königs-Tippspiel')).toBeInTheDocument()
        expect(screen.queryByText('Desktop-Master-Detail')).not.toBeInTheDocument()
        expect(screen.queryByText('Sticker-Wand')).not.toBeInTheDocument()
    })

    it('filters items by search input', async () => {
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('Desktop-Master-Detail')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('roadmap.search.placeholder')
        fireEvent.change(searchInput, {target: {value: 'Hansi'}})

        expect(screen.getByText('Königs-Tippspiel')).toBeInTheDocument()
        expect(screen.queryByText('Desktop-Master-Detail')).not.toBeInTheDocument()
    })

    it('toggles upvote when upvote button clicked', async () => {
        vi.mocked(api.toggleRoadmapVote).mockResolvedValue({
            item_id: 1,
            has_voted: true,
            vote_count: 13,
        })

        renderPage()
        await waitFor(() => {
            expect(screen.getByText('Desktop-Master-Detail')).toBeInTheDocument()
        })

        const voteBtn = screen.getByLabelText('roadmap.vote.upvote: Desktop-Master-Detail')
        fireEvent.click(voteBtn)

        await waitFor(() => {
            expect(api.toggleRoadmapVote).toHaveBeenCalledWith(1)
        })
    })

    it('opens propose idea sheet and submits a new idea', async () => {
        const newItem: RoadmapItem = {
            id: 4,
            club_id: 1,
            created_by_user_id: 10,
            author_name: 'Hansi',
            title: 'Geburtstagsbanner',
            description: 'Banner im nächsten Termin',
            status: 'idea',
            category: 'feature',
            target_version: null,
            is_official: false,
            vote_count: 1,
            has_voted: true,
            created_at: '2026-11-11T12:00:00Z',
            updated_at: '2026-11-11T12:00:00Z',
        }
        vi.mocked(api.createRoadmapItem).mockResolvedValue(newItem)

        renderPage()

        // Click Propose button
        fireEvent.click(screen.getByText('roadmap.propose'))
        expect(screen.getByText('roadmap.propose.title')).toBeInTheDocument()

        // Fill form
        fireEvent.change(screen.getByLabelText(/roadmap\.propose\.field\.title/), {
            target: {value: 'Geburtstagsbanner'},
        })
        fireEvent.change(screen.getByLabelText(/roadmap\.propose\.field\.description/), {
            target: {value: 'Banner im nächsten Termin'},
        })

        // Submit
        fireEvent.click(screen.getByText('roadmap.propose.submit'))

        await waitFor(() => {
            expect(api.createRoadmapItem).toHaveBeenCalledWith({
                title: 'Geburtstagsbanner',
                description: 'Banner im nächsten Termin',
                category: 'feature',
            })
            expect(showToast).toHaveBeenCalledWith('roadmap.propose.success')
        })
    })

    it('toggles 2.0 principles accordion', () => {
        renderPage()
        const accordionBtn = screen.getByText('roadmap.principles.title')
        expect(screen.queryByText('roadmap.principles.p1')).not.toBeInTheDocument()

        fireEvent.click(accordionBtn)
        expect(screen.getByText('roadmap.principles.p1')).toBeInTheDocument()
        expect(screen.getByText('roadmap.principles.p2')).toBeInTheDocument()
        expect(screen.getByText('roadmap.principles.p3')).toBeInTheDocument()

        fireEvent.click(accordionBtn)
        expect(screen.queryByText('roadmap.principles.p1')).not.toBeInTheDocument()
    })
})
