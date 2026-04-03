/**
 * Tests for CommentThread and Avatar components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/api/client', () => ({
    api: {
        listComments: vi.fn().mockResolvedValue([]),
        addComment: vi.fn().mockResolvedValue({}),
        deleteComment: vi.fn().mockResolvedValue({}),
        editComment: vi.fn().mockResolvedValue({}),
        toggleReaction: vi.fn().mockResolvedValue({}),
    },
}))

const defaultStoreState = { user: { id: 1, name: 'Tester', avatar: null, role: 'member' } }

vi.mock('@/store/app', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAppStore: vi.fn((sel?: (s: any) => any) => {
        return sel ? sel(defaultStoreState) : defaultStoreState
    }),
}))

vi.mock('@/utils/error', () => ({ toastError: vi.fn() }))

vi.mock('@/components/ui/MediaUploadButton', () => ({
    MediaUploadButton: () => <div data-testid="media-upload" />,
}))

vi.mock('emoji-picker-react', () => ({
    default: ({ onEmojiClick }: { onEmojiClick: (d: { emoji: string }) => void }) => (
        <div data-testid="emoji-picker">
            <button onClick={() => onEmojiClick({ emoji: '🎉' })}>pick</button>
        </div>
    ),
    Theme: { DARK: 'dark' },
}))

let mockInvalidate: ReturnType<typeof vi.fn>

vi.mock('@tanstack/react-query', () => {
    mockInvalidate = vi.fn()
    return {
        useQuery: vi.fn(({ queryFn }: { queryFn: () => unknown }) => {
            try { queryFn() } catch (_) { /* noop */ }
            return { data: [], isLoading: false }
        }),
        useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidate })),
    }
})

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeComment(overrides: Partial<{
    id: number
    text: string | null
    media_url: string | null
    created_by_id: number
    created_by_name: string
    created_by_avatar: string | null
    created_at: string
    edited_at: string | null
    reactions: { emoji: string; count: number; reacted_by_me: boolean }[]
    replies: unknown[]
}> = {}) {
    return {
        id: 1,
        text: 'Hello',
        media_url: null,
        created_by_id: 99,
        created_by_name: 'Alice',
        created_by_avatar: null,
        created_at: new Date(Date.now() - 5 * 60000).toISOString(), // 5 min ago
        edited_at: null,
        reactions: [],
        replies: [],
        ...overrides,
    }
}

// ── Avatar ────────────────────────────────────────────────────────────────────

describe('Avatar', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders img when src provided', async () => {
        const { Avatar } = await import('../CommentThread')
        render(<Avatar src="https://example.com/avatar.jpg" name="Alice" />)
        expect(document.querySelector('img')).toBeInTheDocument()
        expect(document.querySelector('img')?.src).toBe('https://example.com/avatar.jpg')
    })

    it('renders initials div when no src', async () => {
        const { Avatar } = await import('../CommentThread')
        render(<Avatar src={null} name="Alice" />)
        expect(screen.getByText('A')).toBeInTheDocument()
    })

    it('renders ? initial when name is null', async () => {
        const { Avatar } = await import('../CommentThread')
        render(<Avatar src={null} name={null} />)
        expect(screen.getByText('?')).toBeInTheDocument()
    })

    it('uses first character uppercase for initials', async () => {
        const { Avatar } = await import('../CommentThread')
        render(<Avatar src={null} name="bob" />)
        expect(screen.getByText('B')).toBeInTheDocument()
    })

    it('respects custom size', async () => {
        const { Avatar } = await import('../CommentThread')
        render(<Avatar src={null} name="Alice" size={40} />)
        const el = screen.getByText('A')
        expect(el.style.width).toBe('40px')
        expect(el.style.height).toBe('40px')
    })
})

// ── CommentThread — uncontrolled mode ─────────────────────────────────────────

describe('CommentThread — uncontrolled toggle', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderThread(props: Record<string, unknown> = {}) {
        const { CommentThread } = await import('../CommentThread')
        return render(
            <CommentThread parentType="highlight" parentId={1} {...props} />,
        )
    }

    it('renders toggle button with comment count', async () => {
        await renderThread()
        expect(screen.getByText('💬')).toBeInTheDocument()
        expect(screen.getByText('(0)')).toBeInTheDocument()
    })

    it('thread content is hidden when closed', async () => {
        await renderThread()
        expect(screen.queryByPlaceholderText('comment.placeholder')).not.toBeInTheDocument()
    })

    it('opens thread when toggle button clicked', async () => {
        await renderThread()
        fireEvent.click(screen.getByText('💬'))
        expect(screen.getByPlaceholderText('comment.placeholder')).toBeInTheDocument()
    })

    it('closes thread on second toggle click', async () => {
        await renderThread()
        fireEvent.click(screen.getByText('💬'))
        expect(screen.getByPlaceholderText('comment.placeholder')).toBeInTheDocument()
        fireEvent.click(screen.getByText('💬'))
        expect(screen.queryByPlaceholderText('comment.placeholder')).not.toBeInTheDocument()
    })
})

// ── CommentThread — controlled mode ───────────────────────────────────────────

describe('CommentThread — controlled mode', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderControlled(open: boolean, onOpenChange = vi.fn()) {
        const { CommentThread } = await import('../CommentThread')
        return render(
            <CommentThread
                parentType="announcement"
                parentId={2}
                open={open}
                onOpenChange={onOpenChange}
            />,
        )
    }

    it('does not render toggle button in controlled mode', async () => {
        await renderControlled(false)
        expect(screen.queryByText('💬')).not.toBeInTheDocument()
    })

    it('shows content when controlled open=true', async () => {
        await renderControlled(true)
        expect(screen.getByPlaceholderText('comment.placeholder')).toBeInTheDocument()
    })

    it('does not show content when controlled open=false', async () => {
        await renderControlled(false)
        expect(screen.queryByPlaceholderText('comment.placeholder')).not.toBeInTheDocument()
    })
})

// ── CommentThread — open thread content ──────────────────────────────────────

describe('CommentThread — open thread content', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderOpen() {
        const { CommentThread } = await import('../CommentThread')
        return render(
            <CommentThread parentType="highlight" parentId={1} open onOpenChange={vi.fn()} />,
        )
    }

    it('shows text input', async () => {
        await renderOpen()
        expect(screen.getByPlaceholderText('comment.placeholder')).toBeInTheDocument()
    })

    it('shows media upload button', async () => {
        await renderOpen()
        expect(screen.getByTestId('media-upload')).toBeInTheDocument()
    })

    it('shows submit button ↵', async () => {
        await renderOpen()
        expect(screen.getByText('↵')).toBeInTheDocument()
    })

    it('shows "comment.none" when there are no comments', async () => {
        await renderOpen()
        expect(screen.getByText('comment.none')).toBeInTheDocument()
    })

    it('enables submit when text is typed', async () => {
        await renderOpen()
        const input = screen.getByPlaceholderText('comment.placeholder')
        fireEvent.change(input, { target: { value: 'Test comment' } })
        const submitBtn = screen.getByText('↵')
        expect(submitBtn).not.toBeDisabled()
    })

    it('disables submit when text is empty', async () => {
        await renderOpen()
        const submitBtn = screen.getByText('↵')
        expect(submitBtn).toBeDisabled()
    })

    it('calls api.addComment when submit clicked with text', async () => {
        const { api } = await import('@/api/client')
        await renderOpen()
        const input = screen.getByPlaceholderText('comment.placeholder')
        fireEvent.change(input, { target: { value: 'Hello world' } })
        fireEvent.click(screen.getByText('↵'))
        await waitFor(() => {
            expect(api.addComment).toHaveBeenCalledWith('highlight', 1, 'Hello world', undefined, undefined)
        })
    })

    it('submits on Enter key', async () => {
        const { api } = await import('@/api/client')
        await renderOpen()
        const input = screen.getByPlaceholderText('comment.placeholder')
        fireEvent.change(input, { target: { value: 'Enter submit' } })
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
        await waitFor(() => {
            expect(api.addComment).toHaveBeenCalled()
        })
    })

    it('does not submit on Shift+Enter', async () => {
        const { api } = await import('@/api/client')
        await renderOpen()
        const input = screen.getByPlaceholderText('comment.placeholder')
        fireEvent.change(input, { target: { value: 'No submit' } })
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
        expect(api.addComment).not.toHaveBeenCalled()
    })
})

// ── CommentThread — with comments rendered ────────────────────────────────────

describe('CommentThread — with comments', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderWithComments(comments: unknown[]) {
        const { useQuery } = await import('@tanstack/react-query')
        vi.mocked(useQuery).mockReturnValue({ data: comments, isLoading: false } as ReturnType<typeof useQuery>)
        const { CommentThread } = await import('../CommentThread')
        return render(
            <CommentThread parentType="highlight" parentId={1} open onOpenChange={vi.fn()} />,
        )
    }

    it('renders comment text', async () => {
        await renderWithComments([makeComment({ text: 'Nice shot!' })])
        expect(screen.getByText('Nice shot!')).toBeInTheDocument()
    })

    it('renders comment author name', async () => {
        await renderWithComments([makeComment({ created_by_name: 'Klaus' })])
        expect(screen.getByText('Klaus')).toBeInTheDocument()
    })

    it('renders heart reaction button', async () => {
        await renderWithComments([makeComment({ reactions: [] })])
        expect(screen.getByText('🤍')).toBeInTheDocument()
    })

    it('renders filled heart when already reacted', async () => {
        await renderWithComments([makeComment({
            reactions: [{ emoji: '❤️', count: 3, reacted_by_me: true }],
        })])
        expect(screen.getByText('❤️')).toBeInTheDocument()
    })

    it('shows reaction count when > 0', async () => {
        await renderWithComments([makeComment({
            reactions: [{ emoji: '❤️', count: 5, reacted_by_me: true }],
        })])
        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('shows delete button for own comments', async () => {
        const { useAppStore } = await import('@/store/app')
        const ownState = { user: { id: 42, name: 'Me', avatar: null, role: 'member' } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAppStore).mockImplementation((sel?: (s: any) => any) => sel ? sel(ownState) : ownState)
        await renderWithComments([makeComment({ id: 1, created_by_id: 42 })])
        expect(screen.getByTitle('action.delete')).toBeInTheDocument()
    })

    it('shows edit button for own comments', async () => {
        const { useAppStore } = await import('@/store/app')
        const ownState = { user: { id: 42, name: 'Me', avatar: null, role: 'member' } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAppStore).mockImplementation((sel?: (s: any) => any) => sel ? sel(ownState) : ownState)
        await renderWithComments([makeComment({ id: 1, created_by_id: 42 })])
        expect(screen.getByTitle('action.edit')).toBeInTheDocument()
    })

    it('shows other emoji reactions as pills', async () => {
        await renderWithComments([makeComment({
            reactions: [{ emoji: '😂', count: 2, reacted_by_me: false }],
        })])
        expect(screen.getByText('😂 2')).toBeInTheDocument()
    })

    it('shows count in toggle including nested replies', async () => {
        // CommentThread with toggle; need uncontrolled mode
        const { useQuery } = await import('@tanstack/react-query')
        const nested = makeComment({ id: 2, text: 'Reply', replies: [] })
        const root = makeComment({ id: 1, text: 'Root', replies: [nested] })
        vi.mocked(useQuery).mockReturnValue({ data: [root], isLoading: false } as ReturnType<typeof useQuery>)
        const { CommentThread } = await import('../CommentThread')
        render(<CommentThread parentType="highlight" parentId={1} />)
        // count should be 2 (root + 1 reply)
        expect(screen.getByText('(2)')).toBeInTheDocument()
    })
})

// ── CommentThread — delete flow ───────────────────────────────────────────────

describe('CommentThread — delete flow', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderOwnComment() {
        const { useQuery } = await import('@tanstack/react-query')
        const { useAppStore } = await import('@/store/app')
        const ownState = { user: { id: 42, name: 'Me', avatar: null, role: 'member' } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAppStore).mockImplementation((sel?: (s: any) => any) => {
            return sel ? sel(ownState) : ownState
        })
        vi.mocked(useQuery).mockReturnValue({
            data: [makeComment({ id: 10, created_by_id: 42 })],
            isLoading: false,
        } as ReturnType<typeof useQuery>)
        const { CommentThread } = await import('../CommentThread')
        return render(<CommentThread parentType="highlight" parentId={1} open onOpenChange={vi.fn()} />)
    }

    it('shows confirm buttons after clicking delete icon', async () => {
        await renderOwnComment()
        fireEvent.click(screen.getByTitle('action.delete'))
        expect(screen.getByText('action.confirmDelete')).toBeInTheDocument()
        expect(screen.getByText('action.cancel')).toBeInTheDocument()
    })

    it('calls api.deleteComment on confirm', async () => {
        const { api } = await import('@/api/client')
        await renderOwnComment()
        fireEvent.click(screen.getByTitle('action.delete'))
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => {
            expect(api.deleteComment).toHaveBeenCalledWith(10)
        })
    })

    it('hides confirm on cancel', async () => {
        await renderOwnComment()
        fireEvent.click(screen.getByTitle('action.delete'))
        fireEvent.click(screen.getByText('action.cancel'))
        expect(screen.queryByText('action.confirmDelete')).not.toBeInTheDocument()
    })
})

// ── CommentThread — reply flow (line ~318, 486) ───────────────────────────────

describe('CommentThread — reply flow', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderWithReplyComment() {
        const { useQuery } = await import('@tanstack/react-query')
        vi.mocked(useQuery).mockReturnValue({
            data: [makeComment({ id: 5, text: 'Root comment', created_by_name: 'Alice', created_by_id: 99 })],
            isLoading: false,
        } as ReturnType<typeof useQuery>)
        const { CommentThread } = await import('../CommentThread')
        return render(
            <CommentThread parentType="highlight" parentId={1} open onOpenChange={vi.fn()} />,
        )
    }

    it('shows reply button on comment', async () => {
        await renderWithReplyComment()
        expect(screen.getByText('comment.reply')).toBeInTheDocument()
    })

    it('clicking reply sets replyTo indicator', async () => {
        await renderWithReplyComment()
        fireEvent.click(screen.getByText('comment.reply'))
        // The cancel × button appears in the reply indicator area
        expect(screen.getByText('×')).toBeInTheDocument()
        // Input is prefilled with @Alice
        const input = screen.getByPlaceholderText(/comment\.placeholder|@Alice/)
        expect((input as HTMLInputElement).value).toBe('@Alice ')
    })

    it('clicking reply prefills input with @name', async () => {
        await renderWithReplyComment()
        fireEvent.click(screen.getByText('comment.reply'))
        const input = screen.getByPlaceholderText(/comment\.placeholder|@Alice/)
        // Text should be set to "@Alice "
        expect((input as HTMLInputElement).value).toBe('@Alice ')
    })

    it('cancel reply (×) clears replyTo and text', async () => {
        await renderWithReplyComment()
        fireEvent.click(screen.getByText('comment.reply'))
        // Verify replyTo cancel button is shown
        expect(screen.getByText('×')).toBeInTheDocument()
        // Click the × cancel button
        fireEvent.click(screen.getByText('×'))
        expect(screen.queryByText('×')).not.toBeInTheDocument()
        // Input should be cleared
        const input = screen.getByPlaceholderText('comment.placeholder')
        expect((input as HTMLInputElement).value).toBe('')
    })

    it('passes replyTo id to api.addComment when submitting reply', async () => {
        const { api } = await import('@/api/client')
        await renderWithReplyComment()
        fireEvent.click(screen.getByText('comment.reply'))
        // The input now has @Alice as text (trimmed to @Alice for submit)
        // Add something so submit is possible
        const input = screen.getByPlaceholderText(/comment\.placeholder|@Alice/)
        fireEvent.change(input, { target: { value: '@Alice nice' } })
        fireEvent.click(screen.getByText('↵'))
        await waitFor(() => {
            // replyTo.id = 5, parentType=highlight, parentId=1
            expect(api.addComment).toHaveBeenCalledWith('highlight', 1, '@Alice nice', undefined, 5)
        })
    })
})

// ── CommentThread — add comment error path (line ~431) ────────────────────────

describe('CommentThread — add comment error handling', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls toastError when api.addComment rejects', async () => {
        const { api } = await import('@/api/client')
        const { toastError } = await import('@/utils/error')
        vi.mocked(api.addComment).mockRejectedValueOnce(new Error('network error'))
        const { CommentThread } = await import('../CommentThread')
        render(
            <CommentThread parentType="highlight" parentId={1} open onOpenChange={vi.fn()} />,
        )
        const input = screen.getByPlaceholderText('comment.placeholder')
        fireEvent.change(input, { target: { value: 'Test' } })
        fireEvent.click(screen.getByText('↵'))
        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })
})

// ── CommentThread — edit comment flow (line ~196-204) ─────────────────────────

describe('CommentThread — edit flow', () => {
    beforeEach(() => vi.clearAllMocks())

    async function renderEditableComment() {
        const { useQuery } = await import('@tanstack/react-query')
        const { useAppStore } = await import('@/store/app')
        const ownState = { user: { id: 42, name: 'Me', avatar: null, role: 'member' } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAppStore).mockImplementation((sel?: (s: any) => any) => sel ? sel(ownState) : ownState)
        vi.mocked(useQuery).mockReturnValue({
            data: [makeComment({ id: 7, created_by_id: 42, text: 'Original text' })],
            isLoading: false,
        } as ReturnType<typeof useQuery>)
        const { CommentThread } = await import('../CommentThread')
        return render(
            <CommentThread parentType="highlight" parentId={1} open onOpenChange={vi.fn()} />,
        )
    }

    it('clicking edit icon switches to edit mode showing input', async () => {
        await renderEditableComment()
        fireEvent.click(screen.getByTitle('action.edit'))
        // Should show the save and cancel buttons
        expect(screen.getByText('action.save')).toBeInTheDocument()
        expect(screen.getByText('action.cancel')).toBeInTheDocument()
    })

    it('cancel edit restores view mode', async () => {
        await renderEditableComment()
        fireEvent.click(screen.getByTitle('action.edit'))
        expect(screen.getByText('action.save')).toBeInTheDocument()
        fireEvent.click(screen.getByText('action.cancel'))
        expect(screen.queryByText('action.save')).not.toBeInTheDocument()
        // Original text visible again
        expect(screen.getByText('Original text')).toBeInTheDocument()
    })

    it('saving edit calls api.editComment', async () => {
        const { api } = await import('@/api/client')
        await renderEditableComment()
        fireEvent.click(screen.getByTitle('action.edit'))
        // Edit input has the original text pre-filled
        const editInput = screen.getByDisplayValue('Original text')
        fireEvent.change(editInput, { target: { value: 'Updated text' } })
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => {
            expect(api.editComment).toHaveBeenCalledWith(7, 'Updated text', null)
        })
    })

    it('pressing Enter in edit input saves the comment', async () => {
        const { api } = await import('@/api/client')
        await renderEditableComment()
        fireEvent.click(screen.getByTitle('action.edit'))
        const editInput = screen.getByDisplayValue('Original text')
        fireEvent.change(editInput, { target: { value: 'Enter save' } })
        fireEvent.keyDown(editInput, { key: 'Enter', shiftKey: false })
        await waitFor(() => {
            expect(api.editComment).toHaveBeenCalledWith(7, 'Enter save', null)
        })
    })

    it('pressing Escape in edit input cancels editing', async () => {
        await renderEditableComment()
        fireEvent.click(screen.getByTitle('action.edit'))
        const editInput = screen.getByDisplayValue('Original text')
        fireEvent.keyDown(editInput, { key: 'Escape' })
        expect(screen.queryByText('action.save')).not.toBeInTheDocument()
    })
})
