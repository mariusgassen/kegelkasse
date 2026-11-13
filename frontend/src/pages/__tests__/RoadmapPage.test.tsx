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
    isSuperadmin: vi.fn((u: any) => u?.role === 'superadmin'),
    isProductManager: vi.fn((u: any) => u?.role === 'product_manager'),
    canManageRoadmap: vi.fn((u: any) => u?.role === 'admin' || u?.role === 'superadmin' || u?.role === 'product_manager'),
}))

vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/lib/haptics.ts', () => ({haptic: vi.fn()}))

vi.mock('@/components/ui/CommentThread', () => ({
    CommentThread: ({parentType, parentId}: any) => (
        <div data-testid={`comment-thread-${parentType}-${parentId}`}>CommentThread Mock</div>
    ),
}))

vi.mock('@/components/superadmin/SuperadminRolesManager', () => ({
    SuperadminRolesManager: () => <div data-testid="superadmin-roles-manager">Roles Manager Mock</div>,
}))

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
        category: 'design',
        tags: ['desktop', 'ui'],
        is_pinned: true,
        duplicate_of_id: null,
        duplicate_of_title: null,
        admin_notes: null,
        target_version: '2.0',
        is_official: true,
        vote_count: 12,
        has_voted: false,
        comment_count: 3,
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
        category: 'evening',
        tags: ['tippspiel', 'king'],
        is_pinned: false,
        duplicate_of_id: null,
        duplicate_of_title: null,
        admin_notes: null,
        target_version: null,
        is_official: false,
        vote_count: 5,
        has_voted: true,
        comment_count: 0,
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
        tags: ['sticker'],
        is_pinned: false,
        duplicate_of_id: null,
        duplicate_of_title: null,
        admin_notes: null,
        target_version: '1.73',
        is_official: true,
        vote_count: 20,
        has_voted: false,
        comment_count: 1,
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
            // Tags rendered
            expect(screen.getByText('#desktop')).toBeInTheDocument()
            expect(screen.getByText('#tippspiel')).toBeInTheDocument()
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

    it('filters items by version pill and toggles it off again', async () => {
        renderPage()
        await waitFor(() => expect(screen.getByText('Sticker-Wand')).toBeInTheDocument())
        const pill = screen.getByRole('button', {name: 'v1.73'})
        fireEvent.click(pill)
        expect(screen.getByText('Sticker-Wand')).toBeInTheDocument()
        expect(screen.queryByText('Desktop-Master-Detail')).not.toBeInTheDocument()
        fireEvent.click(pill)
        expect(screen.getByText('Desktop-Master-Detail')).toBeInTheDocument()
    })

    it('lists each used version once as a pill', async () => {
        renderPage()
        await waitFor(() => expect(screen.getByText('Sticker-Wand')).toBeInTheDocument())
        expect(screen.getAllByRole('button', {name: 'v2.0'})).toHaveLength(1)
        expect(screen.getAllByRole('button', {name: 'v1.73'})).toHaveLength(1)
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

    it('toggles comment thread next to upvotes', async () => {
        renderPage()
        await waitFor(() => {
            expect(screen.getByText('Desktop-Master-Detail')).toBeInTheDocument()
        })

        const commentBtn = screen.getByLabelText('roadmap.comments: Desktop-Master-Detail')
        expect(screen.queryByTestId('comment-thread-roadmap-1')).not.toBeInTheDocument()

        fireEvent.click(commentBtn)
        expect(screen.getByTestId('comment-thread-roadmap-1')).toBeInTheDocument()

        fireEvent.click(commentBtn)
        expect(screen.queryByTestId('comment-thread-roadmap-1')).not.toBeInTheDocument()
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
            tags: ['banner'],
            is_pinned: false,
            duplicate_of_id: null,
            duplicate_of_title: null,
            admin_notes: null,
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
                tags: null,
            })
            expect(showToast).toHaveBeenCalledWith('roadmap.propose.success')
        })
    })

    it('shows role management sheet button for superadmins', async () => {
        storeState.user = {id: 1, role: 'superadmin', club_id: null}
        renderPage()

        const manageRolesBtn = screen.getByText('roadmap.manageRoles')
        expect(manageRolesBtn).toBeInTheDocument()

        fireEvent.click(manageRolesBtn)
        expect(screen.getByTestId('superadmin-roles-manager')).toBeInTheDocument()
    })
})
