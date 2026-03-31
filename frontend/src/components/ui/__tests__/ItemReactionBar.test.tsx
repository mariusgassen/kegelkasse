/**
 * Tests for ItemReactionBar component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/api/client', () => ({
    api: {
        getItemReactions: vi.fn(),
        toggleItemReaction: vi.fn(),
        listComments: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))

// Mock emoji picker to avoid rendering the heavy component
vi.mock('emoji-picker-react', () => ({
    default: ({ onEmojiClick }: any) => (
        <div data-testid="emoji-picker">
            <button onClick={() => onEmojiClick({ emoji: '😂' })}>😂</button>
        </div>
    ),
    Theme: { DARK: 'dark' },
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderBar(props: {
    parentType?: 'highlight' | 'announcement' | 'trip'
    parentId?: number
    commentOpen?: boolean
    onCommentToggle?: () => void
    reactions?: any[]
    comments?: any[]
}) {
    const { api } = await import('@/api/client')
    vi.mocked(api.getItemReactions).mockResolvedValue(props.reactions ?? [])
    vi.mocked(api.listComments).mockResolvedValue(props.comments ?? [])

    const { ItemReactionBar } = await import('../ItemReactionBar')
    return render(
        <ItemReactionBar
            parentType={props.parentType ?? 'highlight'}
            parentId={props.parentId ?? 1}
            commentOpen={props.commentOpen}
            onCommentToggle={props.onCommentToggle}
        />,
        { wrapper: makeWrapper() },
    )
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ItemReactionBar — basic rendering', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders heart button', async () => {
        await renderBar({})
        // Heart button is always present (shows 🤍 when no reaction)
        await waitFor(() => {
            expect(screen.getByText('🤍')).toBeInTheDocument()
        })
    })

    it('renders emoji picker button (+😀)', async () => {
        await renderBar({})
        expect(screen.getByText('+😀')).toBeInTheDocument()
    })

    it('does not show comment button when onCommentToggle not provided', async () => {
        await renderBar({})
        expect(screen.queryByText('💬')).not.toBeInTheDocument()
    })
})

describe('ItemReactionBar — comment toggle', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows comment toggle button when onCommentToggle provided', async () => {
        await renderBar({ onCommentToggle: vi.fn() })
        expect(screen.getByText('💬')).toBeInTheDocument()
    })

    it('calls onCommentToggle when 💬 button clicked', async () => {
        const onCommentToggle = vi.fn()
        await renderBar({ onCommentToggle })
        fireEvent.click(screen.getByText('💬'))
        expect(onCommentToggle).toHaveBeenCalled()
    })

    it('shows comment count from loaded comments', async () => {
        const comments = [
            { id: 1, text: 'hi', replies: [{ id: 2 }] },
            { id: 3, text: 'hello', replies: [] },
        ]
        await renderBar({ onCommentToggle: vi.fn(), comments })
        await waitFor(() => {
            // 2 top-level + 1 reply = 3 total
            expect(screen.getByText('3')).toBeInTheDocument()
        })
    })
})

describe('ItemReactionBar — heart reaction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows ❤️ when user has reacted', async () => {
        const reactions = [{ emoji: '❤️', count: 5, reacted_by_me: true }]
        await renderBar({ reactions })
        await waitFor(() => {
            expect(screen.getByText('❤️')).toBeInTheDocument()
        })
    })

    it('shows reaction count when heart reaction exists', async () => {
        const reactions = [{ emoji: '❤️', count: 3, reacted_by_me: false }]
        await renderBar({ reactions })
        await waitFor(() => {
            expect(screen.getByText('3')).toBeInTheDocument()
        })
    })

    it('calls api.toggleItemReaction when heart clicked', async () => {
        const { api } = await import('@/api/client')
        vi.mocked(api.toggleItemReaction).mockResolvedValue({ reactions: [] } as any)
        await renderBar({})
        await waitFor(() => screen.getByText('🤍'))
        fireEvent.click(screen.getByText('🤍'))
        await waitFor(() => {
            expect(api.toggleItemReaction).toHaveBeenCalledWith('highlight', 1, '❤️')
        })
    })
})

describe('ItemReactionBar — other reactions', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows other emoji reactions as pills', async () => {
        const reactions = [
            { emoji: '❤️', count: 2, reacted_by_me: false },
            { emoji: '🎉', count: 1, reacted_by_me: true },
            { emoji: '😂', count: 3, reacted_by_me: false },
        ]
        await renderBar({ reactions })
        await waitFor(() => {
            expect(screen.getByText('🎉')).toBeInTheDocument()
            expect(screen.getByText('😂')).toBeInTheDocument()
        })
    })

    it('calls api.toggleItemReaction when other reaction clicked', async () => {
        const { api } = await import('@/api/client')
        vi.mocked(api.toggleItemReaction).mockResolvedValue({ reactions: [] } as any)
        const reactions = [{ emoji: '🎉', count: 1, reacted_by_me: false }]
        await renderBar({ reactions })
        await waitFor(() => screen.getByText('🎉'))
        fireEvent.click(screen.getByText('🎉'))
        await waitFor(() => {
            expect(api.toggleItemReaction).toHaveBeenCalledWith('highlight', 1, '🎉')
        })
    })
})

describe('ItemReactionBar — emoji picker', () => {
    beforeEach(() => vi.clearAllMocks())

    it('opens emoji picker when +😀 button clicked', async () => {
        await renderBar({})
        fireEvent.click(screen.getByText('+😀'))
        await waitFor(() => {
            expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
        })
    })

    it('calls api.toggleItemReaction when emoji picked', async () => {
        const { api } = await import('@/api/client')
        vi.mocked(api.toggleItemReaction).mockResolvedValue({ reactions: [] } as any)
        await renderBar({})
        fireEvent.click(screen.getByText('+😀'))
        await waitFor(() => screen.getByTestId('emoji-picker'))
        fireEvent.click(screen.getByText('😂'))
        await waitFor(() => {
            expect(api.toggleItemReaction).toHaveBeenCalledWith('highlight', 1, '😂')
        })
    })
})

describe('ItemReactionBar — trip parent type', () => {
    beforeEach(() => vi.clearAllMocks())

    it('passes correct parentType to api calls', async () => {
        const { api } = await import('@/api/client')
        vi.mocked(api.toggleItemReaction).mockResolvedValue({ reactions: [] } as any)
        await renderBar({ parentType: 'trip', parentId: 5 })
        await waitFor(() => screen.getByText('🤍'))
        fireEvent.click(screen.getByText('🤍'))
        await waitFor(() => {
            expect(api.toggleItemReaction).toHaveBeenCalledWith('trip', 5, '❤️')
        })
    })
})
